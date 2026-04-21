// @ts-check
import SDO from 'stored-data-object';
import { resolvePath } from '../../../.shared/lite_rpc/server.js';

/**
 * @typedef {Object} L1Database
 * @property {Object<string, number>} vault - Vault balances
 * @property {Object} bridge_contract - Bridge contract state
 */

// Schema definition for L1 database
const l1Schema = {
	vault: {
		$record: 'number',
	},
	bridge_contract: {
		total_locked_eth: 'number',
		current_state_root: 'string',
		batch_history: {
			$record: {
				state_root: 'string',
				da_root: 'string',
				timestamp: 'number',
			},
		},
		pending_deposits: [
			{
				deposit_id: 'number',
				l1_address: 'string',
				l2_pub_x: 'string',
				l2_pub_y: 'string',
				amount: 'number',
				timestamp: 'number',
			},
		],
		claimed_nullifiers: {
			$record: 'number',
		},
		last_operations_hash: 'string?',
		last_proven_deposit_id: 'number',
	},
};

// Initialize SDO store
let l1Store = null;

/**
 * Initialize L1 database store
 * @returns {Promise<void>}
 */
async function initStore() {
	if (l1Store) return;

	l1Store = await SDO.create({
		file: resolvePath('./db/l1_db.json', import.meta.url),
		schema: l1Schema,
	});
}

/**
 * Đọc L1 database từ file
 * @returns {L1Database}
 */
export function readDB() {
	if (!l1Store) {
		throw new Error('L1 DB not initialized. Call await initL1DB() first.');
	}
	return l1Store.data;
}

/**
 * Ghi L1 database vào file
 * @param {L1Database} data
 * @returns {Promise<void>}
 */
export async function writeDB(data) {
	if (!l1Store) {
		throw new Error('L1 DB not initialized. Call await initL1DB() first.');
	}
	// Update store data reference
	Object.assign(l1Store.data, data);
	await l1Store.write();
}

/**
 * Initialize the L1 database (call this once on server startup)
 * @returns {Promise<void>}
 */
export async function initL1DB() {
	await initStore();
}

/**
 * Thêm một deposit event mới
 * @param {L1Database} db
 * @param {string} l1_address
 * @param {string} l2_pub_x
 * @param {string} l2_pub_y
 * @param {number} amount
 * @returns {{ deposit_id: number, event: any }}
 */
export function addDeposit(db, l1_address, l2_pub_x, l2_pub_y, amount) {
	// 1. Lock ETH
	db.vault[l1_address] -= amount;
	db.bridge_contract.total_locked_eth += amount;

	// 2. Assign incrementing ID and push to pending
	const deposit_id = db.bridge_contract.pending_deposits.length;
	const event = {
		deposit_id,
		l1_address,
		l2_pub_x,
		l2_pub_y,
		amount,
		timestamp: Date.now(),
	};
	db.bridge_contract.pending_deposits.push(event);

	return { deposit_id, event };
}

/**
 * Lấy danh sách các pending deposits
 * @param {L1Database} db
 * @returns {Array<any>}
 */
export function getPendingDeposits(db) {
	return db.bridge_contract.pending_deposits;
}

/**
 * Cập nhật batch history và state root sau khi verify proof
 * @param {L1Database} db
 * @param {string} newStateRoot
 * @param {string} daRoot
 * @param {number} incomingDepositsCount
 * @returns {number} batch_id
 */
export function submitBatch(db, newStateRoot, daRoot, incomingDepositsCount) {
	const batch_id = Object.keys(db.bridge_contract.batch_history).length + 1;
	const lastProvenDepositId = db.bridge_contract.last_proven_deposit_id ?? -1;

	db.bridge_contract.current_state_root = newStateRoot;
	db.bridge_contract.last_proven_deposit_id = lastProvenDepositId + incomingDepositsCount;

	db.bridge_contract.batch_history[batch_id.toString()] = {
		state_root: newStateRoot,
		da_root: daRoot,
		timestamp: Date.now(),
	};

	return batch_id;
}

/**
 * Cập nhật state sau khi verify withdraw
 * @param {L1Database} db
 * @param {string} l1_address
 * @param {number} amount
 * @param {string} nullifierHash
 */
export function commitWithdraw(db, l1_address, amount, nullifierHash) {
	db.bridge_contract.claimed_nullifiers[nullifierHash] = Date.now();
	db.bridge_contract.total_locked_eth -= amount;

	// Credit back to user vault
	if (db.vault[l1_address] === undefined) {
		db.vault[l1_address] = 0;
	}
	db.vault[l1_address] = Number(db.vault[l1_address]) + Number(amount);
}
