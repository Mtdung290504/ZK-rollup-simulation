import express from 'express';
import { l2Store } from '../db/index.js';

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

		// Lấy Treasury từ L2 DB (key là pub_x, luôn có sẵn từ init_db)
		const TREASURY_PUB_X = Object.entries(db.accounts).find(([, v]) => v.__user_name__ === 'Treasury')?.[0];
		if (!TREASURY_PUB_X) return res.status(500).json({ error: 'Treasury account not found in L2 DB' });
		let treasury = db.accounts[TREASURY_PUB_X];
		let syncCount = 0;

		// 3. Process new deposits
		for (const deposit of new_deposits) {
			const { l1_address, amount, deposit_id, l2_pub_x, l2_pub_y } = deposit;

			// Lookup bằng pub_x — O(1) nhờ key mới
			if (!db.accounts[l2_pub_x]) {
				// Onboard dynamically — account này CHƯА được prove, chỉ nhận soft finality
				const newIndex = Object.keys(db.accounts).length;
				db.accounts[l2_pub_x] = {
					pub_y: l2_pub_y,
					balance: '0',
					nonce: '0',
					index: newIndex,
					__user_name__: null,
					proven_in_tree: false,
					snapshot: { balance: '0', nonce: '0' },
				};
				console.log(
					`[L2/Sync] Onboarded new L2 user at index ${newIndex} (pub_x: ${l2_pub_x.slice(0, 10)}...)`,
				);
			}

			const receiver = db.accounts[l2_pub_x];
			const amt = BigInt(amount);

			// Soft Finality: cập nhật balance/nonce — chưa thấy trên proven tree
			treasury.balance = (BigInt(treasury.balance) - amt).toString();
			treasury.nonce = (BigInt(treasury.nonce) + 1n).toString();

			receiver.balance = (BigInt(receiver.balance) + amt).toString();

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

		// Không cập nhật merkle_tree.nodes — chỉ batch_prove mới được viết vào proven tree
		await l2Store.write();

		console.log(`[L2/Sync] Synced ${syncCount} deposits from L1.`);
		return res.status(200).json({ success: true, synced_count: syncCount });
	} catch (err) {
		console.error('[L2/Sync] Internal Error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

export default router;
