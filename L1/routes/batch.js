import express from 'express';
import { contract, eventLog, chainEnv } from '../db/index.js';
import { verifyPlonkProof } from '../lib/plonk_verify.js';
import { computePublicInputHash, computeOperationsHash } from '../lib/merkle_verify.js';

const router = express.Router();

router.post('/batch/submit', async (req, res) => {
	const { proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits, operator_address } = req.body;

	if (!operator_address) {
		return res.status(400).json({ error: 'Missing operator_address' });
	}

	const SUBMIT_FEE = 3;
	const currentBalance = Number(chainEnv.data.vault[operator_address] || 0);

	// EVM Check 1: Can pay gas?
	if (currentBalance < SUBMIT_FEE) {
		return res.status(400).json({ error: 'EVM Revert: Operator has insufficient L1 ETH to pay submission fee (requires 3 ETH)' });
	}

	// EVM: Deduct Gas Fee immediately
	chainEnv.data.vault[operator_address] = currentBalance - SUBMIT_FEE;

	const revertWithGasConsumed = async (msg) => {
		await chainEnv.write();
		return res.status(400).json({ error: `Contract Revert: ${msg} (Gas consumed)` });
	};

	if (!proof || !publicSignals || !oldStateRoot || !newStateRoot || !daRoot) {
		return await revertWithGasConsumed('Missing batch parameters');
	}

	const incomingDepositsCount = Number(num_deposits || 0);

	try {
		const currentStateRoot = contract.data.current_state_root;

		// 1. Check oldStateRoot matches the L1 current state
		if (oldStateRoot !== currentStateRoot) {
			return await revertWithGasConsumed(`State Root Mismatch! Expected ${currentStateRoot}, Got ${oldStateRoot}`);
		}

		// 2. Resolve L1 Operations Hash & Desync ID
		let currentOpsHash = contract.data.last_operations_hash || '0';
		let lastProvenDepositId = contract.data.last_proven_deposit_id ?? -1;

		for (let i = 0; i < incomingDepositsCount; i++) {
			const targetDepId = lastProvenDepositId + 1 + i;
			const depositInfo = contract.data.pending_deposits.find((d) => d.deposit_id === targetDepId);
			if (!depositInfo) {
				return await revertWithGasConsumed(`Cannot rebuild Operations Hash: Deposit ID ${targetDepId} missing from queue.`);
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
			return await revertWithGasConsumed('Public Input Hash Mismatch. Invalid DA or State transition.');
		}

		// 4. DA Availability Simulation (Simulating EIP-4844 KZG Verifier)
		// L1 asserts that the blob MUST be pre-published to the DA layer before evaluating Proof
		const batch_id = Object.keys(contract.data.batch_history).length + 1;
		try {
			const daCheckRes = await fetch(`http://localhost:4000/archive/blobs/${batch_id}`);
			if (!daCheckRes.ok) {
				return await revertWithGasConsumed('Data Withholding Attack detected: DA Blobs not published to Archive Node!');
			}
		} catch (e) {
			return await revertWithGasConsumed('Failed to communicate with DA Layer.');
		}

		// 5. SNARKJS ZK Proof Verify
		const isValidProof = await verifyPlonkProof(proof, publicSignals);

		if (!isValidProof) {
			return await revertWithGasConsumed('Zero-Knowledge Proof Verification Failed!');
		}

		// 6. Update contract state
		contract.data.current_state_root = newStateRoot;
		contract.data.last_operations_hash = currentOpsHash;
		contract.data.last_proven_deposit_id = lastProvenDepositId + incomingDepositsCount;

		contract.data.batch_history[batch_id.toString()] = {
			state_root: newStateRoot,
			da_root: daRoot,
			timestamp: Date.now(),
		};

		// 7. Emit batch accepted event log (giả lập EVM emit BatchAccepted)
		eventLog.data.batch_events.push({
			batch_id,
			state_root: newStateRoot,
			da_root: daRoot,
			timestamp: Date.now(),
		});

		await Promise.all([contract.write(), eventLog.write(), chainEnv.write()]);

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
