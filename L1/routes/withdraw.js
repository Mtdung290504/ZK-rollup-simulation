import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import { verifyMerkleProof, computeLeafHash } from '../lib/merkle_verify.js';
import fs from 'fs';
import path from 'path';

// Config path for wallets to verify Treasury address
const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');

const router = express.Router();

router.post('/withdraw', async (req, res) => {
	const { l1_address, amount, batch_id, tx_data, merkle_proof } = req.body;

	if (!l1_address || !amount || !batch_id || !tx_data || !merkle_proof) {
		return res.status(400).json({ error: 'Missing parameters' });
	}

	const db = readDB();

	// 1. Fetch DA Root of the batch (Batch Existence)
	const batch = db.bridge_contract.batch_history[batch_id.toString()];
	if (!batch) {
		return res.status(400).json({ error: 'Invalid batch_id. Batch does not exist' });
	}

	// 2. Identity Binding & Type Enforcement (Zero-Trust L1 Filters)
	if (l1_address.toLowerCase() !== tx_data.l1_address.toLowerCase()) {
		return res.status(401).json({ error: 'Identity mismatch! msg.sender must match tx_data.l1_address' });
	}
	if (Number(tx_data.tx_type ?? tx_data.type) !== 2) {
		console.log(tx_data);
		return res.status(400).json({ error: 'Invalid tx_type. Only withdrawals (type 2) are allowed.' });
	}
	if (Number(tx_data.amount) <= 0 || Number(tx_data.amount) !== Number(amount)) {
		return res.status(400).json({ error: 'Invalid amount parameters.' });
	}

	// 3. Verify Receiver is Treasury
	const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
	const treasuryPubKey = wallets.treasury.l2.publicKey;

	if (tx_data.to_x !== treasuryPubKey.x || tx_data.to_y !== treasuryPubKey.y) {
		return res.status(400).json({ error: 'Invalid Receiver! Withdrawal L2 tx must send funds to Treasury.' });
	}

	// 4. Calculate Nullifier natively (Anti Double-spend & Tamper Proof)
	const nullifierHash = await computeLeafHash(tx_data);
	if (db.bridge_contract.claimed_nullifiers[nullifierHash]) {
		return res.status(400).json({ error: 'Double-spend attempt: Nullifier already used!' });
	}

	// 5. Verify Merkle Proof (Mathematical Truth)
	const isValidProof = await verifyMerkleProof(tx_data, merkle_proof, batch.da_root);
	if (!isValidProof) {
		return res.status(400).json({ error: 'Invalid Merkle Proof! Transaction not in DA Blob.' });
	}

	// 6. Verify L1 liquidity
	// In reality the contract checks its own balance, here we use total_locked_eth as a proxy
	if (db.bridge_contract.total_locked_eth < amount) {
		return res.status(500).json({ error: 'CRITICAL: Insufficient system liquidity.' });
	}

	// Execute Withdraw
	db.bridge_contract.claimed_nullifiers[nullifierHash] = Date.now();
	db.bridge_contract.total_locked_eth -= amount;

	// Credit back to user vault (in reality this is transferring real ETH)
	if (db.vault[l1_address] === undefined) {
		db.vault[l1_address] = 0;
	}
	db.vault[l1_address] += amount;

	writeDB(db);

	console.log(`[L1/Withdraw] SUCCESS — User ${l1_address} claimed ${amount} ETH.`);
	console.log(`[L1/Withdraw] Nullifier marked: ${nullifierHash.slice(0, 16)}...`);

	return res.status(200).json({ success: true, message: 'Withdrawal successful', amount_claimed: amount });
});

export default router;
