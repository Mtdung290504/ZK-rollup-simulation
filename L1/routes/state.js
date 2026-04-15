import express from 'express';
import { readDB } from '../lib/db.js';

const router = express.Router();

router.get('/state', (req, res) => {
	try {
		const db = readDB();
		res.status(200).json({
			active_batches: Object.keys(db.bridge_contract.batch_history).length,
			current_state_root: db.bridge_contract.current_state_root,
			total_locked_eth: db.bridge_contract.total_locked_eth,
			vaults: db.vault,
			pending_deposits_count: db.bridge_contract.pending_deposits.length
		});
	} catch (err) {
		res.status(500).json({ error: 'Server error loading state' });
	}
});

export default router;
