// @ts-check

import { useContext } from '../../.shared/lite_rpc/server.js';
import { readBatch, writeBatch } from '../db/index.js';
import ArchiveBlobService from './public/ArchiveBlobService.js';

/**
 * @typedef {import('../db/index.js')} Database
 */

export default class ArchiveBlobServiceImp extends useContext(ArchiveBlobService) {
	constructor() {
		super();
	}

	/**
	 * @type {Database['readBatch']}
	 */
	readBatch(name) {
		const { res } = this.context;

		const result = readBatch(name);
		if (!result) res.status(404);
		return result;
	}

	/**
	 * @type {Database['writeBatch']}
	 */
	async writeBatch(name, transactions) {
		const { res } = this.context;

		const result = await writeBatch(name, transactions);
		if (result.success) console.log(`[Archive/Blob] Stored DA Blob for Batch:${name} (${transactions.length} txs)`);
		else res.status(400);

		return result;
	}
}
