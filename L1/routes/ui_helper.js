import express from 'express';
import { readDB } from '../lib/db.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import path from 'path';
import fs from 'fs';

const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');

const router = express.Router();

router.post('/auto-withdraw', async (req, res) => {
	const { batch_id, tx_index, l1_address } = req.body;

	if (batch_id === undefined || tx_index === undefined || !l1_address) {
		return res.status(400).json({ error: 'Missing batch_id, tx_index, or l1_address' });
	}

	try {
		// Fetch DB & DA Blob
		const db = readDB();
		const batchMeta = db.bridge_contract.batch_history[batch_id.toString()];
		if (!batchMeta) return res.status(404).json({ error: 'Batch not found on L1' });

		const archiveRes = await fetch(`http://localhost:4000/archive/blobs/${batch_id}`);
		if (!archiveRes.ok) return res.status(400).json({ error: 'Could not fetch blob from Archive Node' });

		const archiveData = await archiveRes.json();
		const txs = archiveData.transactions;
		if (!txs || txs.length <= tx_index) return res.status(400).json({ error: 'Invalid tx_index' });

		const withdrawTx = txs[tx_index];
		console.log('WD TX:', withdrawTx);

		// Ensure receiver is Treasury (index=0 usually has x,y but we can just pass it to normal withdraw)
		// Since original withdraw logic verifies: receiver_x == treasury_x, we just invoke the actual logic directly

		// Generate Merkle Proof of DA Tree
		const poseidon = await getPoseidon();
		const F = poseidon.F;

		const N_TXS = 4;
		const n_nodes = N_TXS - 1;
		let node_hashes = new Array(2 * N_TXS - 1).fill(0n);

		// ====== BUILD TREE GIỐNG L2 ======
		const DEPTH = 2; // vì N_TXS = 4 => depth = log2(4) = 2
		const CACHE_PATH = path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json');

		const tree = new DenseMerkleTree(poseidon, DEPTH, CACHE_PATH);

		// Fill leaves đúng thứ tự
		for (let i = 0; i < N_TXS; i++) {
			let tx = txs[i];

			if (!tx) {
				const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
				tx = {
					type: 0,
					from_x: wallets.treasury.l2.publicKey.x,
					from_y: wallets.treasury.l2.publicKey.y,
					to_x: '0',
					to_y: '0',
					amount: '0',
					fee: '0',
					nonce: '0',
					l1_address: '0',
				};
			}

			const normTx = normalizeTx(tx);

			const leaf = poseidonHashArr(poseidon, [
				BigInt(normTx.type),
				BigInt(normTx.from_x),
				BigInt(normTx.from_y),
				BigInt(normTx.to_x),
				BigInt(normTx.to_y),
				BigInt(normTx.amount),
				BigInt(normTx.fee),
				BigInt(normTx.nonce),
				BigInt(normTx.l1_address),
			]);

			tree.updateLeaf(i, leaf);
		}

		// ====== GET PATH GIỐNG L2 ======
		function getPath(index) {
			let addrBits = BigInt(index).toString(2).padStart(DEPTH, '0').split('').reverse().map(Number);

			let currentIndex = BigInt(index);
			let pathElements = [];

			for (let i = 0; i < DEPTH; i++) {
				let isRight = addrBits[i];
				let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;

				let siblingHash = tree.nodes[`${i},${siblingIndex}`];

				if (siblingHash === undefined) {
					pathElements.push(F.toString(tree.zeros[i]));
				} else {
					pathElements.push(typeof siblingHash === 'string' ? siblingHash : F.toString(siblingHash));
				}

				currentIndex = currentIndex / 2n;
			}

			return { pathElements, pathIndices: addrBits };
		}

		const merkleProof = getPath(tx_index);

		// DEBUG
		console.log(
			'ALL LEAVES (FIXED):',
			[...Array(N_TXS)].map((_, i) => {
				return tree.nodes[`0,${i}`];
			}),
		);

		const daHash = poseidonHashArr(poseidon, [
			BigInt(withdrawTx.type),
			BigInt(withdrawTx.from_x),
			BigInt(withdrawTx.from_y),
			BigInt(withdrawTx.to_x),
			BigInt(withdrawTx.to_y),
			BigInt(withdrawTx.amount),
			BigInt(withdrawTx.fee),
			BigInt(withdrawTx.nonce),
			BigInt(withdrawTx.l1_address || 0),
		]);
		const nullifierHash = poseidon.F.toString(daHash);

		// Forward to the real endpoint
		const payload = {
			l1_address,
			amount: withdrawTx.amount.toString(),
			batch_id,
			tx_data: withdrawTx,
			merkle_proof: merkleProof,
			nullifier_hash: nullifierHash,
		};

		console.log('ALL LEAVES:', node_hashes.slice(n_nodes));
		const resWithdraw = await fetch('http://localhost:3000/contract/withdraw', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const data = await resWithdraw.json();
		return res.status(resWithdraw.status).json(data);
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'Helper UI withdraw failed' });
	}
});

export default router;

function normalizeTx(tx) {
	return {
		type: tx.type === 'deposit' ? 1 : Number(tx.type || 0),
		from_x: tx.from_x,
		from_y: tx.from_y,
		to_x: tx.to_x,
		to_y: tx.to_y,
		amount: tx.amount || '0',
		fee: tx.fee || '0',
		nonce: tx.nonce || '0',
		l1_address: tx.l1_address || '0',
	};
}
