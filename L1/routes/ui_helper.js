import express from 'express';
import { readDB } from '../lib/db.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import path from 'path';

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
		// In batch_prove, N_TXS is dynamically length of txs, but padding makes it N_TXS.
		// Archive stores padded
		const N_TXS = 4;
		const DEPTH = Math.log2(N_TXS);
		const daTree = new DenseMerkleTree(poseidon, DEPTH, path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json'));

		const padRxHash = poseidonHashArr(poseidon, [0n, 0n]);
		const padDaLeaf = poseidonHashArr(poseidon, [padRxHash, 0n, 0n, 0n]);

		for (let i = 0; i < N_TXS; i++) {
			if (i < txs.length) {
				const rxHash = poseidonHashArr(poseidon, [BigInt(txs[i].to_x), BigInt(txs[i].to_y)]);
				const daLeaf = poseidonHashArr(poseidon, [rxHash, BigInt(txs[i].amount), BigInt(txs[i].fee), BigInt(txs[i].nonce)]);
				daTree.updateLeaf(i, daLeaf);
			} else {
				daTree.updateLeaf(i, padDaLeaf);
			}
		}

		// Get Path for the queried tx
		function getPath(index) {
			let addrBits = BigInt(index).toString(2).padStart(DEPTH, '0').split('').reverse().map(Number);
			let currentIndex = BigInt(index);
			let pathElements = [];
			for (let i = 0; i < DEPTH; i++) {
				let isRight = addrBits[i];
				let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;
				let siblingHash = daTree.nodes[`${i},${siblingIndex}`];
				if (siblingHash === undefined) {
					pathElements.push(F.toString(daTree.zeros[i]));
				} else {
					pathElements.push(typeof siblingHash === 'string' ? siblingHash : F.toString(siblingHash));
				}
				currentIndex = currentIndex / 2n;
			}
			return { pathElements, pathIndices: addrBits };
		}

		const merkleProof = getPath(tx_index);

		const rPubKeyHash = poseidonHashArr(poseidon, [BigInt(withdrawTx.to_x), BigInt(withdrawTx.to_y)]);
		const daHash = poseidonHashArr(poseidon, [
			rPubKeyHash,
			BigInt(withdrawTx.amount),
			BigInt(withdrawTx.fee),
			BigInt(withdrawTx.nonce),
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
