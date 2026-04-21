// @ts-check
import { useContext } from '../../../.shared/lite_rpc/server.js';
import { readDB, writeDB, updateBatchState } from '../db/index.js';
import BatchService from './public/BatchService.js';

export default class BatchServiceImp extends useContext(BatchService) {
	/**
	 * @type {BatchService['submitProof']}
	 */
	async submitProof(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits, transactions) {
		const { res } = this.context;

		if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot || !transactions) {
			res.status(400);
			return { error: 'Missing batch/proof data' };
		}

		try {
			const db = readDB();

			// Submit to L1 Contract FIRST to get definitive batch_id
			const l1Res = await fetch('http://localhost:3000/batch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: ['submitBatch'],
					args: [proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits],
				}),
			});

			const l1Data = await l1Res.json();
			if (!l1Res.ok) {
				console.error(`[L2/Batch] L1 Rejected Batch:`, l1Data.error);
				res.status(400);
				return { error: `L1 Rejection: ${l1Data.error}` };
			}

			const batch_id = l1Data.result?.batch_id;

			// AFTER L1 accepts, submit EXACT SAME batch_id to Archive Node DA
			const archiveRes = await fetch('http://localhost:4000/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					path: ['writeBatch'],
					args: [batch_id.toString(), transactions],
				}),
			});

			if (!archiveRes.ok) {
				console.error('[L2/Batch] Warning: Failed to archive DA Blobs');
			}

			// Update L2 state index
			updateBatchState(db, transactions.length, num_deposits);
			await writeDB(db);

			console.log(`[L2/Batch] Successfully published Batch to Archive and L1 Contract.`);

			return { success: true, batch_id };
		} catch (err) {
			console.error('[L2/Batch] Internal Error:', err);
			res.status(500);
			return { error: 'Server error during batch submission' };
		}
	}
}
