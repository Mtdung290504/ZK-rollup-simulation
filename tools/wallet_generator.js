// @ts-nocheck
/**
 * tools/wallet_generator.js
 *
 * Sinh 4 cặp khóa độc lập cho hệ thống ZK-Rollup:
 *   Alice, Bob, Operator  — có cả L1 (Ethereum mock) lẫn L2 (EdDSA)
 *   Treasury              — chỉ có L2 (ví hệ thống, không giao dịch L1)
 *
 * Output: config/wallets.json
 * Chạy: node tools/wallet_generator.js
 */

import { ethers } from 'ethers';
import { buildEddsa } from 'circomlibjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'config', 'wallets.json');

async function main() {
	const eddsa = await buildEddsa();
	const F = eddsa.F;

	/**
	 * Sinh L1 wallet bằng ethers (địa chỉ chuẩn EIP-55)
	 */
	function genL1Wallet() {
		const wallet = ethers.Wallet.createRandom();
		return {
			address: wallet.address, // 0x + 40 hex chars, checksummed
			privateKey: wallet.privateKey,
		};
	}

	/**
	 * Sinh L2 EdDSA keypair
	 * Private key = 32 random bytes (hex string)
	 * Public key  = { x, y } as decimal strings (field elements)
	 */
	function genL2Keypair() {
		const privBuf = crypto.randomBytes(32);
		const pub = eddsa.prv2pub(privBuf);
		return {
			privateKey: privBuf.toString('hex'),
			publicKey: {
				x: F.toString(pub[0]),
				y: F.toString(pub[1]),
			},
		};
	}

	const entities = {
		alice: {
			name: 'Alice',
			role: 'User test 1',
			l1: genL1Wallet(),
			l2: genL2Keypair(),
		},
		bob: {
			name: 'Bob',
			role: 'User test 2',
			l1: genL1Wallet(),
			l2: genL2Keypair(),
		},
		operator: {
			name: 'Operator',
			role: 'Sequencer — đóng Lô, thu phí Fee trên L2',
			l1: genL1Wallet(),
			l2: genL2Keypair(),
		},
		/**
		 * Treasury là ví hệ thống thuần L2.
		 * Không có L1 wallet — không bao giờ giao dịch trực tiếp trên L1.
		 * Index L2 = 0 (vị trí lá đầu tiên trong State Tree).
		 * Số dư khởi tạo = 2^128 - 1 (MAX_UINT128), ghi trong init_db.js.
		 */
		treasury: {
			name: 'Treasury',
			role: 'Ví hệ thống L2 — không có L1 wallet',
			l1: null,
			l2: {
				privateKey: "968b042527eb3c2cee893e40706e320c48c97d1e95c7de58f92fe2db9bfd0763",
				publicKey: {
					"x": "20257655333597217740899094985403572455718304473578486559526162687121833363396",
					"y": "9368438139727990468422623438035078385108414551455247519960932519731843913490"
				}
			},
		},
	};

	const dir = path.dirname(OUTPUT);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(OUTPUT, JSON.stringify(entities, null, 2));

	console.log('[wallet_generator] Wallets generated:');
	for (const [key, val] of Object.entries(entities)) {
		console.log(`  ${val.name} (${val.role})`);
		if (val.l1) console.log(`    L1 address : ${val.l1.address}`);
		console.log(`    L2 pubkey  : x=${val.l2.publicKey.x.slice(0, 16)}...`);
	}
	console.log(`\n[wallet_generator] Written to: ${OUTPUT}`);
}

main().catch(console.error);
