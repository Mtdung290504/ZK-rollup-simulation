import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ quản lý Deposit trên L1
 */
export default class DepositService extends ServiceInterface {
	/**
	 * @abstract
	 * Tạo một Deposit Event mới trên L1 (khóa ETH vào Vault)
	 *
	 * @param {string} l1_address - Địa chỉ L1 của người dùng
	 * @param {number} amount - Số tiền muốn gửi
	 * @param {string} l2_pub_x - Public key X của tài khoản L2
	 * @param {string} l2_pub_y - Public key Y của tài khoản L2
	 * @returns {{ success: boolean; event: any }}
	 */
	deposit(l1_address, amount, l2_pub_x, l2_pub_y) {
		return this.abstract();
	}

	/**
	 * @abstract
	 * Lấy danh sách các Deposit Event chưa xử lý
	 *
	 * @returns {{ pending_deposits: Array<any> }}
	 */
	getPendingDeposits() {
		return this.abstract();
	}
}
