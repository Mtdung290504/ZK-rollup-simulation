import express from 'express';
import { chainEnv, contract } from '../db/index.js';

const router = express.Router();

router.get('/state', (req, res) => {
	try {
		res.status(200).json({
			active_batches: Object.keys(contract.data.batch_history).length,
			current_state_root: contract.data.current_state_root,
			total_locked_eth: contract.data.total_locked_eth,
			vaults: chainEnv.data.vault,
			pending_deposits_count: contract.data.pending_deposits.length,
		});
	} catch (err) {
		res.status(500).json({ error: 'Server error loading state' });
	}
});

export default router;
