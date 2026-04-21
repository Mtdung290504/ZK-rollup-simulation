// @ts-check
import SDO from 'stored-data-object';
import { resolvePath } from '../../.shared/lite_rpc/server.js';

// Initialize SDO store
let l2Store = await SDO.create({
	file: resolvePath('./db/l2_db.json', import.meta.url),
	schema: {
		accounts: {
			$record: {
				pub_x: 'string',
				pub_y: 'string',
				balance: 'string',
				nonce: 'string',
				index: 'number',
			},
		},
		transactions: [
			{
				type: 'number',
				from_x: 'string',
				from_y: 'string',
				to_x: 'string',
				to_y: 'string',
				amount: 'string',
				fee: 'string',
				nonce: 'string',
				l1_address: 'string',
				deposit_id: 'number',
				sig_R8x: 'string',
				sig_R8y: 'string',
				sig_S: 'string',
				timestamp: 'number',
			},
		],
		system: {
			last_proven_tx_index: 'number',
			last_synced_deposit_id: 'number',
			last_proven_deposit_id: 'number',
			merkle_tree: {
				nodes: {
					$record: 'string?',
				},
			},
		},
	},
});

/**
 * @typedef {typeof l2Store.data} StoredData
 * @typedef {StoredData['transactions'][number]} Transaction
 */

/**
 * Đọc L2 database từ file
 */
export function readDB() {
	return l2Store.data;
}

/**
 * Ghi L2 database vào file
 */
export async function writeDB() {
	await l2Store.write();
}

/**
 * Thêm một transaction mới vào danh sách pending
 *
 * @param {StoredData} data
 * @param {Transaction} tx - Transaction object
 */
export function addTransaction(data, tx) {
	data.transactions.push(tx);
}

/**
 * Cập nhật trạng thái sau khi đóng batch thành công
 *
 * @param {StoredData} data
 * @param {number} transactionCount - Số transactions trong batch
 * @param {number} numDeposits - Số deposits được chứng minh
 */
export function updateBatchState(data, transactionCount, numDeposits) {
	data.system.last_proven_tx_index += transactionCount;
	if (numDeposits) {
		data.system.last_proven_deposit_id += Number(numDeposits);
	}
}
