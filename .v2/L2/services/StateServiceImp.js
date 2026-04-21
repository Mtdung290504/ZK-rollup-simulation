// @ts-check
import { useContext } from '../../.shared/lite_rpc/server.js';
import { readDB } from '../db/index.js';
import StateService from './public/StateService.js';

export default class StateServiceImp extends useContext(StateService) {
	/**
	 * @type {StateService['getState']}
	 */
	getState() {
		const { res } = this.context;
		try {
			const db = readDB();
			return {
				accounts: db.accounts,
				system: db.system,
				transactions_count: db.transactions.length,
			};
		} catch (err) {
			res.status(500);
			return { error: 'Server error loading state' };
		}
	}
}
