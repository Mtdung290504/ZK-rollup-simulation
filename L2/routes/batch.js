import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import path from 'path';

const router = express.Router();

// The manual input.json generation script will snapshot the L2 state, so the Sequencer
// only needs an endpoint to submit the final proof (which batch_prove.js will call after creating proof)

router.post('/batch/submit-proof', async (req, res) => {
	const { proof, publicSignals, oldStateRoot, newStateRoot, daRoot, transactions } = req.body;

	if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot || !transactions) {
		return res.status(400).json({ error: 'Missing batch/proof data' });
	}

	try {
		const db = readDB();

		// Submit to Archive Node first (DA)
		const archiveRes = await fetch('http://localhost:4000/archive/blobs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ batch_id: db.system.last_proven_tx_index + transactions.length, transactions })
		});
		if (!archiveRes.ok) {
			console.error('[L2/Batch] Failed to archive DA Blobs');
			return res.status(500).json({ error: 'DA Archive failure' });
		}

		// Submit to L1 Contract
		const l1Res = await fetch('http://localhost:3000/contract/batch/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ proof, publicSignals, oldStateRoot, newStateRoot, daRoot })
		});

		const l1Data = await l1Res.json();
		if (!l1Res.ok) {
			console.error(`[L2/Batch] L1 Rejected Batch:`, l1Data.error);
			return res.status(400).json({ error: `L1 Rejection: ${l1Data.error}` });
		}

		// Update L2 state index
		db.system.last_proven_tx_index += transactions.length;
		writeDB(db);

		console.log(`[L2/Batch] Successfully published Batch to Archive and L1 Contract.`);
		
		return res.status(200).json({ success: true, batch_id: l1Data.batch_id });
	} catch (err) {
		console.error('[L2/Batch] Internal Error:', err);
		return res.status(500).json({ error: 'Server error during batch submission' });
	}
});

export default router;
