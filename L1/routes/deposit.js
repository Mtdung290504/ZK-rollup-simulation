import express from 'express';
import { readDB, writeDB } from '../lib/db.js';

const router = express.Router();

// L1 Server: MOCK DEPOSIT (L1 -> L2)
router.post('/deposit', (req, res) => {
	const { l1_address, amount, l2_pub_x, l2_pub_y } = req.body;

	if (!l1_address || !amount || amount <= 0 || !l2_pub_x || !l2_pub_y) {
		return res.status(400).json({ error: 'Missing parameters. Requires l1_address, amount, l2_pub_x, l2_pub_y' });
	}

	const db = readDB();

	// Check vault balance
	if (!db.vault[l1_address] || db.vault[l1_address] < amount) {
		return res.status(400).json({ error: 'Insufficient ETH in vault' });
	}

	// 1. Lock ETH
	db.vault[l1_address] -= amount;
	db.bridge_contract.total_locked_eth += amount;

	// 2. Assign Incrementing ID and push to pending
	const deposit_id = db.bridge_contract.pending_deposits.length;
	const event = {
		deposit_id,
		l1_address,
		l2_pub_x,
		l2_pub_y,
		amount,
		timestamp: Date.now(),
	};
	db.bridge_contract.pending_deposits.push(event);

	// Persist
	writeDB(db);

	console.log(`[L1/Deposit] Locked ${amount} ETH for ${l1_address}. Event ID: ${deposit_id}`);
	res.status(200).json({ success: true, event });
});

// Getter for Sequencer to pull pending deposits
router.get('/deposits/pending', (req, res) => {
	const db = readDB();
	res.status(200).json({ pending_deposits: db.bridge_contract.pending_deposits });
});

export default router;
