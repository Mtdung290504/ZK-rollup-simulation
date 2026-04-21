// @ts-check
import { resolvePath } from '../../.shared/lite_rpc/server.js';
import SDO from 'stored-data-object';

// Create or open file
const batchStorage = await SDO.create({
	file: resolvePath('./storage/batchs.json', import.meta.url),
	schema: {
		$record: [
			{
				type: 'number',
				from_x: 'string',
				from_y: 'string',
				to_x: 'string',
				to_y: 'string',
				amount: 'number',
				fee: 'number',
				nonce: 'number',
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

/**
 * @param {string} name
 * @returns {typeof batchStorage.data[string] | undefined}
 */
export function readBatch(name) {
	return batchStorage.data[name];
}

/**
 *
 * @param {string} name
 * @param {(typeof batchStorage)['data'][string]} transations
 */
export async function writeBatch(name, transations) {
	batchStorage.data[name] = transations;

	try {
		await batchStorage.write();
		return { success: true };
	} catch (error) {
		return { success: false, cause: String(error) };
	}
}
