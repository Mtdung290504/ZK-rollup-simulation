import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ lấy trạng thái L2
 */
export default class StateService extends ServiceInterface {
	/**
	 * @abstract
	 * Lấy toàn bộ trạng thái L2
	 *
	 * @returns {any}
	 */
	getState() {
		return this.abstract();
	}
}
