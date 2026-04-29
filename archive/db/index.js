// @ts-check
import SDO from 'stored-data-object';
import { resolvePath } from '../../utils.js';

const archiveSchema = SDO.schema({
	batches: {
		$record: [
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
	},
});

export const archiveStore = await SDO.create({
	file: resolvePath('./archive.json', import.meta.url),
	schema: archiveSchema,
	default: { batches: {} },
});
