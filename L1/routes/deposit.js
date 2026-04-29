import express from 'express';
import { chainEnv, contract, eventLog } from '../db/index.js';

const router = express.Router();

// L1 Server: MOCK DEPOSIT (L1 -> L2)
router.post('/deposit', async (req, res) => {
	const { l1_address, amount, l2_pub_x, l2_pub_y } = req.body;

	if (!l1_address || !amount || amount <= 0 || !l2_pub_x || !l2_pub_y) {
		return res.status(400).json({ error: 'Missing parameters. Requires l1_address, amount, l2_pub_x, l2_pub_y' });
	}

	// Check vault balance
	if (!chainEnv.data.vault[l1_address] || chainEnv.data.vault[l1_address] < amount) {
		return res.status(400).json({ error: 'Insufficient ETH in vault' });
	}

	// 1. Lock ETH
	chainEnv.data.vault[l1_address] -= amount;
	contract.data.total_locked_eth += amount;

	// 2. Assign Incrementing ID and push to pending
	const deposit_id = contract.data.pending_deposits.length;
	/** @type {import('../db/index.js').DepositEvent} */
	const event = {
		deposit_id,
		l1_address,
		l2_pub_x,
		l2_pub_y,
		amount,
		timestamp: Date.now(),
	};

	contract.data.pending_deposits.push(event);

	// 3. Emit event log (giả lập EVM emit DepositLocked)
	eventLog.data.deposit_events.push({ ...event });

	await Promise.all([chainEnv.write(), contract.write(), eventLog.write()]);

	console.log(`[L1/Deposit] Locked ${amount} ETH for ${l1_address}. Event ID: ${deposit_id}`);
	res.status(200).json({ success: true, event });
});

// Getter for Sequencer to pull pending deposits
router.get('/deposits/pending', (req, res) => {
	res.status(200).json({ pending_deposits: contract.data.pending_deposits });
});

export default router;
