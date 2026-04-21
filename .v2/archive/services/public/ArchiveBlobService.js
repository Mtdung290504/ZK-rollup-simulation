import { ServiceInterface } from '../../../.shared/lite_rpc/public/shared.js';

/**
 * @typedef {import('../../db/index.js')} Database
 */

export default class ArchiveBlobService extends ServiceInterface {
	/**
	 * @abstract
	 * @type {Database['readBatch']}
	 */
	readBatch(name) {
		return this.abstract();
	}

	/**
	 * @abstract
	 * @type {Database['writeBatch']}
	 */
	writeBatch(name, batchData) {
		return this.abstract();
	}
}
