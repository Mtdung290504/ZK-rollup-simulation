// @ts-check
import { useContext } from '../../../.shared/lite_rpc/server.js';
import { readDB, writeDB, addDeposit, getPendingDeposits } from '../db/index.js';
import DepositService from './public/DepositService.js';

/**
 * @typedef {import('../db/index.js').L1Database} Database
 */

export default class DepositServiceImp extends useContext(DepositService) {
	/**
	 * @type {DepositService['deposit']}
	 */
	async deposit(l1_address, amount, l2_pub_x, l2_pub_y) {
		const { res } = this.context;

		if (!l1_address || !amount || amount <= 0 || !l2_pub_x || !l2_pub_y) {
			res.status(400);
			return { error: 'Missing parameters. Requires l1_address, amount, l2_pub_x, l2_pub_y' };
		}

		const db = readDB();

		// Check vault balance
		if (!db.vault[l1_address] || db.vault[l1_address] < amount) {
			res.status(400);
			return { error: 'Insufficient ETH in vault' };
		}

		const { deposit_id, event } = addDeposit(db, l1_address, l2_pub_x, l2_pub_y, amount);

		// Persist
		await writeDB(db);

		console.log(`[L1/Deposit] Locked ${amount} ETH for ${l1_address}. Event ID: ${deposit_id}`);
		return { success: true, event };
	}

	/**
	 * @type {DepositService['getPendingDeposits']}
	 */
	getPendingDeposits() {
		const db = readDB();
		return { pending_deposits: getPendingDeposits(db) };
	}
}
