import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @abstract
 * Dịch vụ quản lý Batch submissions từ L2
 */
export default class BatchService extends ServiceInterface {
	/**
	 * @abstract
	 * Nhận và verify ZK Proof từ L2 Sequencer
	 *
	 * @param {any} proof - ZK Proof object
	 * @param {Array<string>} publicSignals - Public signals từ circuit
	 * @param {string} oldStateRoot - State root trước khi batch
	 * @param {string} newStateRoot - State root sau khi batch
	 * @param {string} daRoot - DA root từ blob
	 * @param {number} num_deposits - Số lượng deposits trong batch
	 * @returns {{ success: boolean; batch_id?: number }}
	 */
	submitBatch(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits) {
		return this.abstract();
	}
}
