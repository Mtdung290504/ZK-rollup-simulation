// @ts-check
import { useContext } from '../../../.shared/lite_rpc/server.js';
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
				active_batches: Object.keys(db.bridge_contract.batch_history).length,
				current_state_root: db.bridge_contract.current_state_root,
				total_locked_eth: db.bridge_contract.total_locked_eth,
				vaults: db.vault,
				pending_deposits_count: db.bridge_contract.pending_deposits.length,
			};
		} catch (err) {
			res.status(500);
			return { error: 'Server error loading state' };
		}
	}
}
