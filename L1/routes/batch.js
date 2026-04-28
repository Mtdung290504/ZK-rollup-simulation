import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import { verifyPlonkProof } from '../lib/plonk_verify.js';
import { computePublicInputHash, computeOperationsHash } from '../lib/merkle_verify.js';

const router = express.Router();

router.post('/batch/submit', async (req, res) => {
	const { proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits } = req.body;

	if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot) {
		return res.status(400).json({ error: 'Missing batch parameters' });
	}

	const incomingDepositsCount = Number(num_deposits || 0);

	try {
		const db = readDB();
		const currentStateRoot = db.bridge_contract.current_state_root;

		// 1. Check oldStateRoot matches the L1 current state
		if (oldStateRoot !== currentStateRoot) {
			return res
				.status(400)
				.json({ error: `State Root Mismatch! Expected ${currentStateRoot}, Got ${oldStateRoot}` });
		}

		// 2. Resolve L1 Operations Hash & Desync ID
		let currentOpsHash = db.bridge_contract.last_operations_hash || '0';
		let lastProvenDepositId = db.bridge_contract.last_proven_deposit_id ?? -1;

		for (let i = 0; i < incomingDepositsCount; i++) {
			const targetDepId = lastProvenDepositId + 1 + i;
			const depositInfo = db.bridge_contract.pending_deposits.find((d) => d.deposit_id === targetDepId);
			if (!depositInfo) {
				return res
					.status(400)
					.json({ error: `Cannot rebuild Operations Hash: Deposit ID ${targetDepId} missing from queue.` });
			}
			currentOpsHash = await computeOperationsHash(
				currentOpsHash,
				depositInfo.deposit_id,
				depositInfo.l2_pub_x,
				depositInfo.l2_pub_y,
				depositInfo.amount,
			);
		}

		// 3. Validate Public Input Hash
		const expectedPublicInputHash = await computePublicInputHash(
			oldStateRoot,
			newStateRoot,
			daRoot,
			currentOpsHash,
		);

		console.log('[DEBUG L1] oldStateRoot:', oldStateRoot);
		console.log('[DEBUG L1] newStateRoot:', newStateRoot);
		console.log('[DEBUG L1] daRoot:', daRoot);
		console.log('[DEBUG L1] currentOpsHash:', currentOpsHash);

		// Circom public signals is an array of strings
		if (publicSignals[0] !== expectedPublicInputHash) {
			console.error(`[L1/Batch] Expected Hash: ${expectedPublicInputHash}, got ${publicSignals[0]}`);
			return res.status(400).json({ error: 'Public Input Hash Mismatch. Invalid DA or State transition.' });
		}

		// 4. DA Availability Simulation (Simulating EIP-4844 KZG Verifier)
		// L1 asserts that the blob MUST be pre-published to the DA layer before evaluating Proof
		const batch_id = Object.keys(db.bridge_contract.batch_history).length + 1;
		try {
			const daCheckRes = await fetch(`http://localhost:4000/archive/blobs/${batch_id}`);
			if (!daCheckRes.ok) {
				return res
					.status(400)
					.json({ error: 'Data Withholding Attack detected: DA Blobs not published to Archive Node!' });
			}
		} catch (e) {
			return res.status(500).json({ error: 'Failed to communicate with DA Layer.' });
		}

		// 5. SNARKJS ZK Proof Verify
		const isValidProof = await verifyPlonkProof(proof, publicSignals);

		if (!isValidProof) {
			return res.status(400).json({ error: 'Zero-Knowledge Proof Verification Failed!' });
		}

		// 6. Update state
		db.bridge_contract.current_state_root = newStateRoot;
		db.bridge_contract.last_operations_hash = currentOpsHash;
		db.bridge_contract.last_proven_deposit_id = lastProvenDepositId + incomingDepositsCount;

		db.bridge_contract.batch_history[batch_id.toString()] = {
			state_root: newStateRoot,
			da_root: daRoot,
			timestamp: Date.now(),
		};

		writeDB(db);

		console.log(`[L1/Batch] -------------------------------------`);
		console.log(`[L1/Batch] SUCCESS — Batch #${batch_id} Verified & Accepted!`);
		console.log(`[L1/Batch] New State Root: ${newStateRoot}`);
		console.log(`[L1/Batch] DA Root: ${daRoot}`);

		return res.status(200).json({ success: true, batch_id });
	} catch (err) {
		console.error('[L1/Batch] Internal Error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

export default router;
