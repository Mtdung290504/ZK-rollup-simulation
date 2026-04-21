import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ quản lý Withdraw từ L2 về L1
 */
export default class WithdrawService extends ServiceInterface {
	/**
	 * @abstract
	 * Xử lý yêu cầu rút tiền từ L2 về L1
	 *
	 * @param {string} l1_address - Địa chỉ L1 nhận tiền
	 * @param {number} amount - Số tiền rút
	 * @param {number} batch_id - ID của batch chứa tx withdraw
	 * @param {any} tx_data - Dữ liệu giao dịch L2 gốc
	 * @param {Array<string>} merkle_proof - Merkle proof chứng minh tx trong DA blob
	 * @returns {{ success: boolean; amount_claimed?: number }}
	 */
	withdraw(l1_address, amount, batch_id, tx_data, merkle_proof) {
		return this.abstract();
	}
}
