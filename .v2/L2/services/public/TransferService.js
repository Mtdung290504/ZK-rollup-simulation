import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ quản lý Transfer trên L2
 */
export default class TransferService extends ServiceInterface {
	/**
	 * @abstract
	 * Xử lý giao dịch transfer giữa hai tài khoản L2
	 *
	 * @param {number} tx_type - Loại giao dịch (0: transfer, 1: deposit, 2: withdraw)
	 * @param {string} from_x - Public key X người gửi
	 * @param {string} from_y - Public key Y người gửi
	 * @param {string} to_x - Public key X người nhận
	 * @param {string} to_y - Public key Y người nhận
	 * @param {string|number} amount - Số tiền chuyển
	 * @param {string|number} fee - Phí giao dịch
	 * @param {string|number} nonce - Nonce của người gửi
	 * @param {string} l1_address - Địa chỉ L1 (dùng cho withdraw)
	 * @param {string} sig_R8x - Chữ ký EdDSA R8x
	 * @param {string} sig_R8y - Chữ ký EdDSA R8y
	 * @param {string} sig_S - Chữ ký EdDSA S
	 * @returns {{ success: boolean; error?: string }}
	 */
	transfer(tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address, sig_R8x, sig_R8y, sig_S) {
		return this.abstract();
	}
}
