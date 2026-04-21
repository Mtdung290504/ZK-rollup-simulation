import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ quản lý Batch submissions
 */
export default class BatchService extends ServiceInterface {
	/**
	 * @abstract
	 * Submit batch proof tới L1 contract và Archive node
	 *
	 * @param {any} proof - ZK Proof object
	 * @param {Array<string>} publicSignals - Public signals từ circuit
	 * @param {string} oldStateRoot - State root trước khi batch
	 * @param {string} newStateRoot - State root sau khi batch
	 * @param {string} daRoot - DA root từ blob
	 * @param {number} num_deposits - Số lượng deposits trong batch
	 * @param {Array<any>} transactions - Danh sách transactions
	 * @returns {{ success: boolean; batch_id?: number }}
	 */
	submitProof(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits, transactions) {
		return this.abstract();
	}
}
