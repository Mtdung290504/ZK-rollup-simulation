import express from 'express';
import { chainEnv, contract, eventLog } from '../db/index.js';
import { ethers } from 'ethers';
import { buildBabyjub } from 'circomlibjs';

let babyJub;
buildBabyjub().then((b) => { babyJub = b; });

const router = express.Router();

// L1 Server: MOCK DEPOSIT (L1 -> L2)
router.post('/deposit', async (req, res) => {
	const { l1_address, l1_signature, amount, l2_pub_x, l2_pub_y } = req.body;

	if (!l1_address || !l1_signature || amount === undefined || !l2_pub_x || !l2_pub_y) {
		return res
			.status(400)
			.json({ error: 'Missing parameters. Requires l1_address, l1_signature, amount, l2_pub_x, l2_pub_y' });
	}

	try {
		const messageHash = ethers.solidityPackedKeccak256(
			['string', 'uint256', 'uint256', 'uint256'],
			['DEPOSIT_TO_L2', amount, BigInt(l2_pub_x), BigInt(l2_pub_y)],
		);
		const recoveredAddr = ethers.verifyMessage(ethers.getBytes(messageHash), l1_signature);
		if (recoveredAddr.toLowerCase() !== l1_address.toLowerCase()) {
			return res.status(400).json({ error: 'Invalid EVM Signature for this Deposit payload' });
		}
	} catch (e) {
		return res.status(400).json({ error: 'Failed to verify EVM signature' });
	}

	const L1_GAS_FEE = 3;
	
	// EVM Check 1: Can pay gas?
	if ((chainEnv.data.vault[l1_address] || 0) < L1_GAS_FEE) {
		return res.status(400).json({ error: 'EVM Revert: Insufficient funds for gas (requires 3 ETH)' });
	}

	// EVM: Deduct Gas Fee immediately (Gas is consumed regardless of contract execution)
	chainEnv.data.vault[l1_address] -= L1_GAS_FEE;

	// Contract Check 1: Amount must be > 0 and integer
	if (amount <= 0 || !Number.isInteger(amount)) {
		await chainEnv.write();
		return res.status(400).json({ error: 'Contract Revert: Deposit amount must be a positive integer. Gas consumed.' });
	}

	// Contract Check 2: L2 Public Key must be on BabyJubjub curve
	if (babyJub) {
		try {
			const x = BigInt(l2_pub_x);
			const y = BigInt(l2_pub_y);
			const isValid = babyJub.inCurve([babyJub.F.e(x), babyJub.F.e(y)]);
			if (!isValid) {
				await chainEnv.write();
				return res.status(400).json({ error: 'Contract Revert: L2 Public Key is not a valid point on the BabyJubjub curve. Gas consumed.' });
			}
		} catch (e) {
			await chainEnv.write();
			return res.status(400).json({ error: 'Contract Revert: Invalid L2 Public Key format. Gas consumed.' });
		}
	}

	// EVM Check 2: Can pay value?
	if (chainEnv.data.vault[l1_address] < amount) {
		await chainEnv.write();
		return res.status(400).json({ error: 'EVM Revert: Insufficient funds for value. Gas consumed.' });
	}

	// 1. Lock ETH
	chainEnv.data.vault[l1_address] -= amount;
	contract.data.total_locked_eth += amount;

	// 2. Assign Incrementing ID and push to pending
	const deposit_id = contract.data.pending_deposits.length;
	/** @type {import('../db/index.js').DepositEvent} */
	const event = {
		deposit_id,
		l1_address,
		l2_pub_x,
		l2_pub_y,
		amount,
		timestamp: Date.now(),
	};

	contract.data.pending_deposits.push(event);

	// 3. Emit event log (giả lập EVM emit DepositLocked)
	eventLog.data.deposit_events.push({ ...event });

	await Promise.all([chainEnv.write(), contract.write(), eventLog.write()]);

	console.log(`[L1/Deposit] Locked ${amount} ETH for ${l1_address}. Event ID: ${deposit_id}`);
	res.status(200).json({ success: true, event });
});

// Getter for Sequencer to pull pending deposits
router.get('/deposits/pending', (req, res) => {
	res.status(200).json({ pending_deposits: contract.data.pending_deposits });
});

export default router;
