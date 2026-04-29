// @ts-check

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
	if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory())
		throw new Error(`Not a directory: ${fullPath}`);

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
