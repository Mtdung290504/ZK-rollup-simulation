// @ts-check
import SDO from 'stored-data-object';
import { resolvePath } from '../../utils.js';

// ─────────────────────────────────────────────
// Schema definitions
// ─────────────────────────────────────────────

const chainEnvSchema = SDO.schema({
	/** Số dư ETH của các ví L1 — giả lập môi trường blockchain */
	vault: { $record: 'number' },
});

const contractStorageSchema = SDO.schema({
	/** Tổng ETH bị khóa trong bridge (Slot 1) */
	total_locked_eth: 'number',
	/** State Root hiện tại của L2 (Slot 2) */
	current_state_root: 'string',
	/** Operations Hash cuối cùng đã được prove (Slot 3) */
	last_operations_hash: 'string',
	/** Deposit ID cuối cùng đã được prove vào batch (Slot 4) */
	last_proven_deposit_id: 'number',
	/** Lịch sử các batch đã được verify — key là batch_id (string) */
	batch_history: {
		$record: {
			state_root: 'string',
			da_root: 'string',
			timestamp: 'number',
		},
	},
	/** Hàng đợi deposits chờ L2 xử lý */
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
	/** Nullifier đã dùng để chống double-spend — key là nullifier hash */
	claimed_nullifiers: { $record: 'number' },
});

const eventLogSchema = SDO.schema({
	/** Deposit events giả lập EVM emit — để L2 scan */
	deposit_events: [
		{
			deposit_id: 'number',
			l1_address: 'string',
			l2_pub_x: 'string',
			l2_pub_y: 'string',
			amount: 'number',
			timestamp: 'number',
		},
	],
	/** Batch accepted events giả lập EVM emit */
	batch_events: [
		{
			batch_id: 'number',
			state_root: 'string',
			da_root: 'string',
			timestamp: 'number',
		},
	],
});

// ─────────────────────────────────────────────
// Store initialization (top-level await, ESM)
// ─────────────────────────────────────────────

export const chainEnv = await SDO.create({
	file: resolvePath('./storage/chain_env.json', import.meta.url),
	schema: chainEnvSchema,
	default: { vault: {} },
});

export const contract = await SDO.create({
	file: resolvePath('./storage/contract_storage.json', import.meta.url),
	schema: contractStorageSchema,
	default: {
		total_locked_eth: 0,
		current_state_root: '0',
		last_operations_hash: '0',
		last_proven_deposit_id: -1,
		batch_history: {},
		pending_deposits: [],
		claimed_nullifiers: {},
	},
});

export const eventLog = await SDO.create({
	file: resolvePath('./storage/event_log.json', import.meta.url),
	schema: eventLogSchema,
	default: {
		deposit_events: [],
		batch_events: [],
	},
});

// ─────────────────────────────────────────────
// Type exports (derived from SDO schema)
// ─────────────────────────────────────────────

/**
 * @typedef {typeof chainEnv.data} ChainEnvData
 * @typedef {typeof contract.data} ContractData
 * @typedef {typeof eventLog.data} EventLogData
 * @typedef {ContractData['pending_deposits'][number]} DepositEvent
 * @typedef {ContractData['batch_history'][string]} BatchRecord
 */
