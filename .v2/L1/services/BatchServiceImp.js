// @ts-check
import { useContext } from '../../../.shared/lite_rpc/server.js';
import { readDB, writeDB, submitBatch } from '../db/index.js';
import BatchService from './public/BatchService.js';
import { verifyPlonkProof } from '../../../L1/lib/plonk_verify.js';
import { computePublicInputHash, computeOperationsHash } from '../../../L1/lib/merkle_verify.js';

/**
 * @typedef {import('../db/index.js').L1Database} Database
 */

export default class BatchServiceImp extends useContext(BatchService) {
	/**
	 * @type {BatchService['submitBatch']}
	 */
	async submitBatch(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits) {
		const { res } = this.context;

		if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot) {
			res.status(400);
			return { error: 'Missing batch parameters' };
		}

		const incomingDepositsCount = Number(num_deposits || 0);

		try {
			const db = readDB();
			const currentStateRoot = db.bridge_contract.current_state_root;

			// 1. Check oldStateRoot matches the L1 current state
			if (oldStateRoot !== currentStateRoot) {
				res.status(400);
				return { error: `State Root Mismatch! Expected ${currentStateRoot}, Got ${oldStateRoot}` };
			}

			// 2. Resolve L1 Operations Hash & Deposit ID
			let currentOpsHash = db.bridge_contract.last_operations_hash || '0';
			let lastProvenDepositId = db.bridge_contract.last_proven_deposit_id ?? -1;

			for (let i = 0; i < incomingDepositsCount; i++) {
				const targetDepId = lastProvenDepositId + 1 + i;
				const depositInfo = db.bridge_contract.pending_deposits.find(d => d.deposit_id === targetDepId);
				if (!depositInfo) {
					res.status(400);
					return { error: `Cannot rebuild Operations Hash: Deposit ID ${targetDepId} missing from queue.` };
				}
				currentOpsHash = await computeOperationsHash(
					currentOpsHash,
					depositInfo.deposit_id,
					depositInfo.l2_pub_x,
					depositInfo.l2_pub_y,
					depositInfo.amount
				);
			}

			// 3. Validate Public Input Hash
			const expectedPublicInputHash = await computePublicInputHash(oldStateRoot, newStateRoot, daRoot, currentOpsHash);

			console.log('[DEBUG L1] oldStateRoot:', oldStateRoot);
			console.log('[DEBUG L1] newStateRoot:', newStateRoot);
			console.log('[DEBUG L1] daRoot:', daRoot);
			console.log('[DEBUG L1] currentOpsHash:', currentOpsHash);

			// Circom public signals is an array of strings
			if (publicSignals[0] !== expectedPublicInputHash) {
				console.error(`[L1/Batch] Expected Hash: ${expectedPublicInputHash}, got ${publicSignals[0]}`);
				res.status(400);
				return { error: 'Public Input Hash Mismatch. Invalid DA or State transition.' };
			}

			// 4. SNARKJS ZK Proof Verify
			const isValidProof = await verifyPlonkProof(proof, publicSignals);

			if (!isValidProof) {
				res.status(400);
				return { error: 'Zero-Knowledge Proof Verification Failed!' };
			}

			// 5. Update state
			db.bridge_contract.last_operations_hash = currentOpsHash;
			const batch_id = submitBatch(db, newStateRoot, daRoot, incomingDepositsCount);

			await writeDB(db);

			console.log(`[L1/Batch] -------------------------------------`);
			console.log(`[L1/Batch] SUCCESS — Batch #${batch_id} Verified & Accepted!`);
			console.log(`[L1/Batch] New State Root: ${newStateRoot}`);
			console.log(`[L1/Batch] DA Root: ${daRoot}`);

			return { success: true, batch_id };
		} catch (err) {
			console.error('[L1/Batch] Internal Error:', err);
			res.status(500);
			return { error: 'Server error' };
		}
	}
}
