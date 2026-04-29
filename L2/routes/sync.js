import express from 'express';
import { l2Store } from '../db/index.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import fs from 'fs';
import path from 'path';

const cachePath = path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json');
const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');
const router = express.Router();

router.get('/sync-deposits', async (req, res) => {
	try {
		const db = l2Store.data;

		// 1. Fetch from L1 Mock Server
		const response = await fetch('http://localhost:3000/contract/deposits/pending');
		if (!response.ok) {
			return res.status(500).json({ error: 'Failed to connect to L1 Server' });
		}

		const data = await response.json();
		const all_pending = data.pending_deposits || [];

		// 2. Filter new deposits
		const last_id = db.system.last_synced_deposit_id ?? -1;
		const new_deposits = all_pending.filter((d) => d.deposit_id > last_id);

		if (new_deposits.length === 0) {
			return res.status(200).json({ message: 'L2 is already synced with L1. No new deposits.' });
		}

		const poseidon = await getPoseidon();
		const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
		const TREASURY_PUB_X = wallets.treasury.l2.publicKey.x;

		const tree = new DenseMerkleTree(poseidon, 4, cachePath);
		tree.loadNodes(db.system.merkle_tree.nodes);

		// accounts keyed by pub_x — lấy Treasury bằng key trực tiếp
		let treasury = db.accounts[TREASURY_PUB_X];
		let syncCount = 0;

		/**
		 * Hash lá Merkle từ pub_x (key) và data của account
		 * @param {string} pub_x
		 * @param {{ pub_y: string, balance: string, nonce: string }} acc
		 */
		const hashLeaf = (pub_x, acc) =>
			poseidonHashArr(poseidon, [BigInt(pub_x), BigInt(acc.pub_y), BigInt(acc.balance), BigInt(acc.nonce)]);

		// 3. Process new deposits
		for (const deposit of new_deposits) {
			const { l1_address, amount, deposit_id, l2_pub_x, l2_pub_y } = deposit;

			// Lookup bằng pub_x — O(1) nhờ key mới
			if (!db.accounts[l2_pub_x]) {
				// Onboard dynamically nếu chưa tồn tại
				const newIndex = Object.keys(db.accounts).length;
				db.accounts[l2_pub_x] = {
					pub_y: l2_pub_y,
					balance: '0',
					nonce: '0',
					index: newIndex,
					__user_name__: null,
				};
				console.log(
					`[L2/Sync] Onboarded new L2 user at index ${newIndex} (pub_x: ${l2_pub_x.slice(0, 10)}...)`,
				);
			}

			const receiver = db.accounts[l2_pub_x];
			const amt = BigInt(amount);

			// Soft Finality: Treasury → Receiver
			treasury.balance = (BigInt(treasury.balance) - amt).toString();
			treasury.nonce = (BigInt(treasury.nonce) + 1n).toString();
			tree.updateLeaf(treasury.index, hashLeaf(TREASURY_PUB_X, treasury));

			receiver.balance = (BigInt(receiver.balance) + amt).toString();
			tree.updateLeaf(receiver.index, hashLeaf(l2_pub_x, receiver));

			// Append TX (Using dummy sig for Treasury deposit)
			const tx = {
				type: 1,
				from_x: TREASURY_PUB_X,
				from_y: treasury.pub_y,
				to_x: l2_pub_x,
				to_y: l2_pub_y,
				amount: amount.toString(),
				fee: '0',
				nonce: (BigInt(treasury.nonce) - 1n).toString(),
				l1_address,
				deposit_id,
				sig_R8x: '0',
				sig_R8y: '0',
				sig_S: '0',
				timestamp: Date.now(),
			};
			db.transactions.push(tx);

			db.system.last_synced_deposit_id = deposit_id;
			syncCount++;
		}

		db.system.merkle_tree.nodes = tree.exportNodes();
		await l2Store.write();

		console.log(`[L2/Sync] Synced ${syncCount} deposits from L1.`);
		return res.status(200).json({ success: true, synced_count: syncCount });
	} catch (err) {
		console.error('[L2/Sync] Internal Error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

export default router;
