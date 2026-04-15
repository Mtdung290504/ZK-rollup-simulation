import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import fs from 'fs';
import path from 'path';

const cachePath = path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json');
const router = express.Router();

router.get('/sync-deposits', async (req, res) => {
	try {
		const db = readDB();

		// 1. Fetch from L1 Mock Server
		const response = await fetch('http://localhost:3000/contract/deposits/pending');
		if (!response.ok) {
			return res.status(500).json({ error: 'Failed to connect to L1 Server' });
		}
		
		const data = await response.json();
		const all_pending = data.pending_deposits || [];

		// 2. Filter new deposits
		const last_id = db.system.last_processed_deposit_id;
		const new_deposits = all_pending.filter(d => d.deposit_id > last_id);

		if (new_deposits.length === 0) {
			return res.status(200).json({ message: 'L2 is already synced with L1. No new deposits.' });
		}

		const poseidon = await getPoseidon();
		const tree = new DenseMerkleTree(poseidon, 6, cachePath);
		tree.loadNodes(db.system.merkle_tree.nodes);

		let treasury = db.accounts["Treasury"];
		let syncCount = 0;

		// We identify the L2 account dynamically using l2_pub_x and l2_pub_y.

		// 3. Process new deposits
		for (const deposit of new_deposits) {
			const { l1_address, amount, deposit_id, l2_pub_x, l2_pub_y } = deposit;
			
			// Find account by public key
			let accountKey = Object.keys(db.accounts).find(key => 
				db.accounts[key].pub_x === l2_pub_x && db.accounts[key].pub_y === l2_pub_y
			);

			// Onboard dynamically if unseen
			if (!accountKey) {
				accountKey = `UID_${Object.keys(db.accounts).length}`;
				db.accounts[accountKey] = {
					pub_x: l2_pub_x,
					pub_y: l2_pub_y,
					balance: "0",
					nonce: "0",
					index: Object.keys(db.accounts).length
				};
				console.log(`[L2/Sync] Onboarded new L2 user: ${accountKey} (${l2_pub_x.slice(0, 10)}...)`);
			}

			const receiver = db.accounts[accountKey];
			const amt = BigInt(amount);

			// Soft Finality Update
			// Treasury -> Receiver (No fee, auto signature bypass for Treasury in MOCK)
			// Deduct Treasury
			treasury.balance = (BigInt(treasury.balance) - amt).toString();
			treasury.nonce = (BigInt(treasury.nonce) + 1n).toString();
			let leafTreasury = poseidonHashArr(poseidon, [BigInt(treasury.pub_x), BigInt(treasury.pub_y), BigInt(treasury.balance), BigInt(treasury.nonce)]);
			tree.updateLeaf(treasury.index, leafTreasury);

			// Credit Receiver
			receiver.balance = (BigInt(receiver.balance) + amt).toString();
			let leafReceiver = poseidonHashArr(poseidon, [BigInt(receiver.pub_x), BigInt(receiver.pub_y), BigInt(receiver.balance), BigInt(receiver.nonce)]);
			tree.updateLeaf(receiver.index, leafReceiver);

			// Append TX (Using dummy sig for Treasury deposit)
			const tx = {
				type: 'deposit',
				from_x: treasury.pub_x, 
				from_y: treasury.pub_y,
				to_x: receiver.pub_x, 
				to_y: receiver.pub_y,
				amount: amount.toString(),
				fee: "0",
				nonce: (BigInt(treasury.nonce) - 1n).toString(),
				sig_R8x: "0", sig_R8y: "0", sig_S: "0",
				deposit_id,
				timestamp: Date.now()
			};
			db.transactions.push(tx);

			db.system.last_processed_deposit_id = deposit_id;
			syncCount++;
		}

		db.system.merkle_tree.nodes = tree.exportNodes();
		writeDB(db);

		console.log(`[L2/Sync] Synced ${syncCount} deposits from L1.`);
		return res.status(200).json({ success: true, synced_count: syncCount });

	} catch (err) {
		console.error('[L2/Sync] Internal Error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

export default router;
