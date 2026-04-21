import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ đồng bộ Deposit từ L1
 */
export default class SyncService extends ServiceInterface {
	/**
	 * @abstract
	 * Đồng bộ Deposit Events từ L1 vào L2 state
	 *
	 * @returns {{ message: string; syncCount?: number }}
	 */
	syncDeposits() {
		return this.abstract();
	}
}
