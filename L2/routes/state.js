import express from 'express';
import { l2Store } from '../db/index.js';

const router = express.Router();

router.get('/state', (req, res) => {
	try {
		const db = l2Store.data;
		const root = db.system.merkle_tree.nodes['4,0'] || '0';
		
		res.status(200).json({
			state_root: root,
			accounts: db.accounts,
			last_proven_tx_index: db.system.last_proven_tx_index,
			last_processed_deposit_id: db.system.last_processed_deposit_id,
			pending_transactions: db.transactions.length - (db.system.last_proven_tx_index + 1)
		});
	} catch (err) {
		res.status(500).json({ error: 'Server error loading L2 state' });
	}
});

export default router;
