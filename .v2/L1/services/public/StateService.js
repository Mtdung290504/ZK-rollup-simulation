import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ lấy trạng thái của L1 bridge
 */
export default class StateService extends ServiceInterface {
	/**
	 * @abstract
	 * Lấy toàn bộ trạng thái hiện tại của L1
	 *
	 * @returns {any}
	 */
	getState() {
		return this.abstract();
	}
}
