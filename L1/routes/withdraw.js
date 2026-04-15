import express from 'express';
import { readDB, writeDB } from '../lib/db.js';
import { verifyMerkleProof } from '../lib/merkle_verify.js';
import fs from 'fs';
import path from 'path';

// Config path for wallets to verify Treasury address
const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');

const router = express.Router();

router.post('/withdraw', async (req, res) => {
	const { l1_address, amount, batch_id, tx_data, merkle_proof, nullifier_hash } = req.body;

	if (!l1_address || !amount || !batch_id || !tx_data || !merkle_proof || !nullifier_hash) {
		return res.status(400).json({ error: 'Missing parameters' });
	}

	const db = readDB();

	// 1. O(1) Check Nullifier (Anti Double-spend)
	if (db.bridge_contract.claimed_nullifiers[nullifier_hash]) {
		return res.status(400).json({ error: 'Double-spend attempt: Nullifier already used!' });
	}

	// 2. Fetch DA Root of the batch
	const batch = db.bridge_contract.batch_history[batch_id.toString()];
	if (!batch) {
		return res.status(400).json({ error: 'Invalid batch_id' });
	}

	// 3. Verify Merkle Proof
	const isValidProof = await verifyMerkleProof(tx_data, merkle_proof, batch.da_root);
	if (!isValidProof) {
		return res.status(400).json({ error: 'Invalid Merkle Proof! Transaction not in DA Blob.' });
	}

	// 4. Verify Receiver is Treasury
	const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
	const treasuryPubKey = wallets.treasury.l2.publicKey;
	
	if (tx_data.to_x !== treasuryPubKey.x || tx_data.to_y !== treasuryPubKey.y) {
		return res.status(400).json({ error: 'Invalid Receiver! Withdrawal L2 tx must send funds to Treasury.' });
	}

	// 5. Verify L1 liquidity
	// In reality the contract checks its own balance, here we use total_locked_eth as a proxy
	if (db.bridge_contract.total_locked_eth < amount) {
		return res.status(500).json({ error: 'CRITICAL: Insufficient system liquidity.' });
	}

	// 6. Execute Withdraw
	db.bridge_contract.claimed_nullifiers[nullifier_hash] = Date.now();
	db.bridge_contract.total_locked_eth -= amount;

	// Credit back to user vault (in reality this is transferring real ETH)
	if (db.vault[l1_address] === undefined) {
		db.vault[l1_address] = 0;
	}
	db.vault[l1_address] += amount;

	writeDB(db);

	console.log(`[L1/Withdraw] SUCCESS — User ${l1_address} claimed ${amount} ETH.`);
	console.log(`[L1/Withdraw] Nullifier marked: ${nullifier_hash.slice(0, 16)}...`);

	return res.status(200).json({ success: true, message: 'Withdrawal successful', amount_claimed: amount });
});

export default router;
