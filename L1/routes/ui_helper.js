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

		// Ensure receiver is Treasury (index=0 usually has x,y but we can just pass it to normal withdraw)
		// Since original withdraw logic verifies: receiver_x == treasury_x, we just invoke the actual logic directly

		// Generate Merkle Proof of DA Tree
		const poseidon = await getPoseidon();
		const F = poseidon.F;
		
		const N_TXS = 4;
		const n_nodes = N_TXS - 1;
		let node_hashes = new Array(2 * N_TXS - 1).fill(0n);

		for (let i = 0; i < N_TXS; i++) {
			let tx = txs[i];
			if (!tx) {
				const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
				tx = { 
					type: 0, 
					from_x: wallets.treasury.l2.publicKey.x, 
					from_y: wallets.treasury.l2.publicKey.y, 
					to_x: '0', to_y: '0', amount: '0', fee: '0', nonce: '0', l1_address: '0' 
				};
			}
			const daLeaf = poseidonHashArr(poseidon, [
				BigInt(tx.type || 0), BigInt(tx.from_x), BigInt(tx.from_y), 
				BigInt(tx.to_x), BigInt(tx.to_y), BigInt(tx.amount || 0), 
				BigInt(tx.fee || 0), BigInt(tx.nonce || 0), BigInt(tx.l1_address || 0)
			]);
			node_hashes[n_nodes + i] = daLeaf;
		}

		for (let i = n_nodes - 1; i >= 0; i--) {
			node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
		}

		// Get Path for the queried tx
		function getPath(targetIndex) {
			let pathElements = [];
			let pathIndices = [];
			let currentIndex = n_nodes + targetIndex;

			while (currentIndex > 0) {
				let isRightChild = currentIndex % 2 === 0;
				let sibling = isRightChild ? currentIndex - 1 : currentIndex + 1;

				pathElements.push(F.toString(node_hashes[sibling]));
				pathIndices.push(isRightChild ? 1 : 0);

				currentIndex = Math.floor((currentIndex - 1) / 2);
			}
			return { pathElements, pathIndices };
		}

		const merkleProof = getPath(tx_index);

		const daHash = poseidonHashArr(poseidon, [
			BigInt(withdrawTx.type), BigInt(withdrawTx.from_x), BigInt(withdrawTx.from_y), 
			BigInt(withdrawTx.to_x), BigInt(withdrawTx.to_y), BigInt(withdrawTx.amount), 
			BigInt(withdrawTx.fee), BigInt(withdrawTx.nonce), BigInt(withdrawTx.l1_address || 0)
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
