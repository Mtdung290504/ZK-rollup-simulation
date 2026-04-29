import express from 'express';
import { archiveStore } from '../db/index.js';

const router = express.Router();

router.post('/blobs', async (req, res) => {
	const { batch_id, transactions } = req.body;

	if (batch_id === undefined || !transactions) {
		return res.status(400).json({ error: 'Missing batch_id or transactions' });
	}

	archiveStore.data.batches[batch_id] = transactions;
	await archiveStore.write();

	console.log(`[Archive/Blob] Stored DA Blob for Batch #${batch_id} (${transactions.length} txs)`);
	res.status(200).json({ success: true });
});

router.get('/blobs/:batch_id', (req, res) => {
	const { batch_id } = req.params;
	const transactions = archiveStore.data.batches[batch_id];

	if (!transactions) {
		return res.status(404).json({ error: 'Blob not found' });
	}

	res.status(200).json({ batch_id, transactions });
});

export default router;
