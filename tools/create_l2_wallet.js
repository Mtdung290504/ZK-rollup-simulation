/**
 * tools/create_l2_wallet.js
 *
 * Sinh một cặp khóa EdDSA mới cho L2 và ghi vào config/L2_created_wallets/<name>.json
 *
 * Cách dùng:
 *   node tools/create_l2_wallet.js <name>
 *
 * Ví dụ:
 *   node tools/create_l2_wallet.js Charlie
 *
 * Lưu ý: __user_name__ chỉ là nhãn mô phỏng, không tồn tại trong hệ thống thực.
 * Khóa định danh thực sự trên L2 là pub_x (public key X).
 */

import { buildEddsa } from 'circomlibjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'config', 'L2_created_wallets');

async function main() {
	const name = process.argv[2];

	if (!name || name.trim() === '') {
		console.error('[create_l2_wallet] Thiếu tên. Cách dùng: node tools/create_l2_wallet.js <name>');
		process.exit(1);
	}

	const safeName = name.trim();
	const outputPath = path.join(OUTPUT_DIR, `${safeName}.json`);

	if (fs.existsSync(outputPath)) {
		console.error(`[create_l2_wallet] Đã tồn tại ví với tên "${safeName}". Xóa file cũ nếu muốn tạo lại.`);
		process.exit(1);
	}

	const eddsa = await buildEddsa();
	const F = eddsa.F;

	const privBuf = crypto.randomBytes(32);
	const pub = eddsa.prv2pub(privBuf);

	const wallet = {
		/** Nhãn mô phỏng — chỉ dùng trong PoC, không tồn tại trong hệ thống thực */
		__user_name__: safeName,
		privateKey: privBuf.toString('hex'),
		publicKey: {
			/** pub_x là định danh thực sự trên L2 (key trong accounts map) */
			x: F.toString(pub[0]),
			y: F.toString(pub[1]),
		},
	};

	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(wallet, null, 2));

	console.log(`[create_l2_wallet] Đã tạo ví L2 cho "${safeName}":`);
	console.log(`  pub_x : ${wallet.publicKey.x}`);
	console.log(`  pub_y : ${wallet.publicKey.y}`);
	console.log(`  File  : ${outputPath}`);
	console.log(`\n  Để nạp tiền vào L2, dùng pub_x và pub_y này khi gọi POST /contract/deposit trên L1.`);
}

main().catch(console.error);
