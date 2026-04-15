import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import { verifyPlonkProof } from '../lib/plonk_verify.js';
import { computePublicInputHash } from '../lib/merkle_verify.js';

const router = express.Router();

router.post('/batch/submit', async (req, res) => {
	const { proof, publicSignals, oldStateRoot, newStateRoot, daRoot } = req.body;

	if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot) {
		return res.status(400).json({ error: 'Missing batch parameters' });
	}

	try {
		const db = readDB();
		const currentStateRoot = db.bridge_contract.current_state_root;

		// 1. Check oldStateRoot matches the L1 current state
		if (oldStateRoot !== currentStateRoot) {
			return res.status(400).json({ error: `State Root Mismatch! Expected ${currentStateRoot}, Got ${oldStateRoot}` });
		}

		// 2. Validate Public Input Hash (Calldata Optimization trick)
		const expectedPublicInputHash = await computePublicInputHash(oldStateRoot, newStateRoot, daRoot);

		// Circom public signals is an array of strings
		if (publicSignals[0] !== expectedPublicInputHash) {
			console.error(`[L1/Batch] Expected Hash: ${expectedPublicInputHash}, got ${publicSignals[0]}`);
			return res.status(400).json({ error: 'Public Input Hash Mismatch. Invalid DA or State transition.' });
		}

		// 3. SNARKJS ZK Proof Verify
		const isValidProof = await verifyPlonkProof(proof, publicSignals);

		if (!isValidProof) {
			return res.status(400).json({ error: 'Zero-Knowledge Proof Verification Failed!' });
		}

		// 4. Update state
		const batch_id = Object.keys(db.bridge_contract.batch_history).length + 1;
		db.bridge_contract.current_state_root = newStateRoot;
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
