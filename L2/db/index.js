// @ts-check
import SDO from 'stored-data-object';
import { resolvePath } from '../../utils.js';

const l2Schema = SDO.schema({
	accounts: {
		$record: {
			pub_y: 'string',
			balance: 'string',
			nonce: 'string',
			index: 'number',
			__user_name__: 'string?',
		},
	},
	proven_accounts: {
		$record: {
			pub_y: 'string',
			balance: 'string',
			nonce: 'string',
			index: 'number',
			__user_name__: 'string?',
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
			nodes: { $record: 'string' },
		},
	},
});

export const l2Store = await SDO.create({
	file: resolvePath('./l2_db.json', import.meta.url),
	schema: l2Schema,
	default: {
		accounts: {},
		proven_accounts: {},
		transactions: [],
		system: {
			last_proven_tx_index: -1,
			last_synced_deposit_id: -1,
			last_proven_deposit_id: -1,
			merkle_tree: { nodes: {} },
		},
	},
});
