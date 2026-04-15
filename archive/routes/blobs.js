import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const DB_DIR = path.join(process.cwd(), 'archive', 'db');

if (!fs.existsSync(DB_DIR)) {
	fs.mkdirSync(DB_DIR, { recursive: true });
}

router.post('/blobs', (req, res) => {
	const { batch_id, transactions } = req.body;

	if (batch_id === undefined || !transactions) {
		return res.status(400).json({ error: 'Missing batch_id or transactions' });
	}

	const filePath = path.join(DB_DIR, `batch_${batch_id}.json`);
	fs.writeFileSync(filePath, JSON.stringify(transactions, null, 2));

	console.log(`[Archive/Blob] Stored DA Blob for Batch #${batch_id} (${transactions.length} txs)`);
	res.status(200).json({ success: true });
});

router.get('/blobs/:batch_id', (req, res) => {
	const { batch_id } = req.params;
	const filePath = path.join(DB_DIR, `batch_${batch_id}.json`);

	if (!fs.existsSync(filePath)) {
		return res.status(404).json({ error: 'Blob not found' });
	}

	const transactions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	res.status(200).json({ batch_id, transactions });
});

export default router;
