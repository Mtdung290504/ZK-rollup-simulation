import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServiceInterface } from './public/shared.js';

/**
 * @typedef {Object} ServiceContext
 * @property {import('express').Request} req
 * @property {import('express').Response} res
 */

/**
 * Tạo express middleware xử lý RPC call
 *
 * @template {new (...args: any[]) => import('./public/shared.js').ServiceInterface & { context?: ServiceContext }} T
 * @param {T} ImplementType - Class implement service interface tương ứng đã định nghĩa
 * @param {(context: ServiceContext) => InstanceType<T>} [createServiceInstance] - Hàm để khởi tạo instance service
 * @param {{ serializer?: { parse: (text: string) => any, stringify: (data: any) => string } }} [options] - Tuỳ chọn custom serializer
 */
export function rpcService(ImplementType, createServiceInstance, options = {}) {
	const router = express.Router();
	const serializer = options.serializer || JSON;

	// Hỗ trợ parse raw payload nếu có custom serializer
	router.use(express.text({ type: '*/*', limit: '50mb' }));

	// Thu thập allowed methods từ prototype
	const allowedMethods = getMethods(ImplementType.prototype);

	router.post('/', async (req, res, next) => {
		let body;
		try {
			// Thử parse bằng serializer (hoặc mặc định là JSON)
			body = typeof req.body === 'string' && req.body.length ? serializer.parse(req.body) : req.body;
		} catch (error) {
			return res.status(400).json({ error: 'Invalid payload format' });
		}

		const { path, args } = body ?? {};

		if (!Array.isArray(path)) return res.status(400).json({ error: 'Invalid RPC path' });

		// Chỉ cho phép flat methods
		if (path.length !== 1) return res.status(400).json({ error: 'Only direct method calls allowed' });

		const [methodName] = path;

		// Validate type
		if (typeof methodName !== 'string') return res.status(400).json({ error: 'Invalid method name type' });
		if (!allowedMethods.has(methodName))
			return res.status(403).json({ error: `Method "${methodName}" is not exposed` });

		// Tạo service và inject context
		const context = { req, res };
		const service = createServiceInstance ? createServiceInstance(context) : new ImplementType();
		if ('context' in service) service.context = context;

		// @ts-expect-error: runtime-validated RPC method
		const fn = service[methodName];
		try {
			const result = await fn.apply(service, args ?? []);
			res.type('application/json').send(serializer.stringify({ result }));
		} catch (e) {
			next(e);
		}
	});

	return router;
}

/**
 * @template {new (...args: any[]) => any} T
 * @param {T} Base
 */
export function useContext(Base) {
	return class RPCContext extends Base {
		/**
		 * @private
		 * @type {ServiceContext | undefined}
		 */
		_context;

		/**
		 * Lấy về context req/res của request để xử lý trong service khi cần
		 * @returns {ServiceContext}
		 */
		get context() {
			if (!this._context) throw new Error('Service context not initialized. This is a framework bug.');
			return this._context;
		}

		/**
		 * @param {ServiceContext} value
		 */
		set context(value) {
			this._context = value;
		}
	};
}

/**
 * Thu thập methods từ prototype chain
 *
 * @param {object} proto
 * @returns {Set<PropertyKey>}
 */
function getMethods(proto) {
	const keys = new Set();

	while (proto && proto !== Object.prototype && proto !== ServiceInterface.prototype) {
		for (const k of Reflect.ownKeys(proto)) {
			if (k === 'constructor') continue;

			const desc = Object.getOwnPropertyDescriptor(proto, k);
			if (desc && typeof desc.value === 'function') keys.add(k);
		}
		proto = Object.getPrototypeOf(proto);
	}

	return keys;
}

/**
 * Tạo middleware phục vụ static directory (express.static)
 *
 * @param {string} relativePath - Đường dẫn tương đối
 * @param {ImportMeta['url']} [metaURL] - Base để resolve (mặc định process.cwd)
 * @returns {express.RequestHandler}
 * @throws {Error} Nếu đường dẫn không tồn tại hoặc không phải thư mục
 */
export function staticDir(relativePath, metaURL) {
	const fullPath = resolvePath(relativePath, metaURL);
	if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) throw new Error(`Not a directory: ${fullPath}`);

	return express.static(fullPath);
}

/**
 * Tạo middleware phục vụ một file tĩnh duy nhất
 *
 * - Trả về file khi request đúng `/` hoặc `/filename`
 * - Các request khác sẽ chuyển tiếp sang `next()`
 *
 * @param {string} relativePath - Đường dẫn tương đối
 * @param {ImportMeta['url']} [metaURL] - Base để resolve (mặc định process.cwd)
 * @returns {express.RequestHandler}
 * @throws {Error} Nếu đường dẫn không tồn tại hoặc không phải file
 */
export function staticFile(relativePath, metaURL) {
	const fullPath = resolvePath(relativePath, metaURL);
	if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) throw new Error(`Not a file: ${fullPath}`);

	const filename = path.basename(fullPath);

	return (req, res, next) => {
		if (req.path === '/' || req.path === '/' + filename) res.sendFile(fullPath);
		else next();
	};
}

/**
 * Chuẩn hóa đường dẫn từ đường dẫn tương đối tính từ metaURL
 *
 * @param {string} relativePath - Đường dẫn tương đối
 * @param {ImportMeta['url']} [metaURL]
 *   - Nếu được cung cấp: resolve theo file đó
 *   - Nếu không: resolve từ process.cwd()
 */
export function resolvePath(relativePath, metaURL) {
	// Không truyền metaURL → lấy gốc là project (cwd)
	if (!metaURL) return path.resolve(process.cwd(), relativePath);

	const filename = fileURLToPath(metaURL);
	return path.resolve(path.dirname(filename), relativePath);
}
