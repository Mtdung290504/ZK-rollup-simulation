// @ts-check
import { useContext } from '../../../.shared/lite_rpc/server.js';
import { readDB, writeDB, commitWithdraw } from '../db/index.js';
import WithdrawService from './public/WithdrawService.js';
import { verifyMerkleProof, computeLeafHash } from '../../../L1/lib/merkle_verify.js';
import fs from 'fs';
import path from 'path';

// Config path for wallets to verify Treasury address
const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');

export default class WithdrawServiceImp extends useContext(WithdrawService) {
	/**
	 * @type {WithdrawService['withdraw']}
	 */
	async withdraw(l1_address, amount, batch_id, tx_data, merkle_proof) {
		const { res } = this.context;

		if (!l1_address || !amount || !batch_id || !tx_data || !merkle_proof) {
			res.status(400);
			return { error: 'Missing parameters' };
		}

		const db = readDB();

		// 1. Fetch DA Root of the batch (Batch Existence)
		const batch = db.bridge_contract.batch_history[batch_id.toString()];
		if (!batch) {
			res.status(400);
			return { error: 'Invalid batch_id. Batch does not exist' };
		}

		// 2. Identity Binding & Type Enforcement (Zero-Trust L1 Filters)
		if (l1_address.toLowerCase() !== tx_data.l1_address.toLowerCase()) {
			res.status(401);
			return { error: 'Identity mismatch! msg.sender must match tx_data.l1_address' };
		}
		if (Number(tx_data.type) !== 2) {
			res.status(400);
			return { error: 'Invalid tx_type. Only withdrawals (type 2) are allowed.' };
		}
		if (Number(tx_data.amount) <= 0 || Number(tx_data.amount) !== Number(amount)) {
			res.status(400);
			return { error: 'Invalid amount parameters.' };
		}

		// 3. Verify Receiver is Treasury
		const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
		const treasuryPubKey = wallets.treasury.l2.publicKey;

		if (tx_data.to_x !== treasuryPubKey.x || tx_data.to_y !== treasuryPubKey.y) {
			res.status(400);
			return { error: 'Invalid Receiver! Withdrawal L2 tx must send funds to Treasury.' };
		}

		// 4. Calculate Nullifier natively (Anti Double-spend & Tamper Proof)
		const nullifierHash = await computeLeafHash(tx_data);
		if (db.bridge_contract.claimed_nullifiers[nullifierHash]) {
			res.status(400);
			return { error: 'Double-spend attempt: Nullifier already used!' };
		}

		// 5. Verify Merkle Proof (Mathematical Truth)
		const isValidProof = await verifyMerkleProof(tx_data, merkle_proof, batch.da_root);
		if (!isValidProof) {
			res.status(400);
			return { error: 'Invalid Merkle Proof! Transaction not in DA Blob.' };
		}

		// 6. Verify L1 liquidity
		// In reality the contract checks its own balance, here we use total_locked_eth as a proxy
		if (db.bridge_contract.total_locked_eth < amount) {
			res.status(500);
			return { error: 'CRITICAL: Insufficient system liquidity.' };
		}

		// Execute Withdraw
		commitWithdraw(db, l1_address, amount, nullifierHash);
		await writeDB(db);

		console.log(`[L1/Withdraw] SUCCESS — User ${l1_address} claimed ${amount} ETH. New balance:`, db.vault[l1_address]);
		console.log(`[L1/Withdraw] Nullifier marked: ${nullifierHash.slice(0, 16)}...`);

		return { success: true, message: 'Withdrawal successful', amount_claimed: amount };
	}
}
