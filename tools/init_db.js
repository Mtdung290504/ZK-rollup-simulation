/**
 * tools/init_db.js
 *
 * Khởi tạo dữ liệu JSON ban đầu cho hệ thống từ config/wallets.json
 * - L1: vault có sẵn 100 ETH cho Alice, 100 ETH cho Bob
 * - L2: Merkle Tree có sẵn 4 account. Treasury balance = MAX_UINT128
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPoseidon, poseidonHashArr } from './poseidon.js';
import { DenseMerkleTree } from './merkle_tree.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WALLETS_PATH = path.join(ROOT, 'config', 'wallets.json');
const L1_DB_PATH = path.join(ROOT, 'L1', 'db', 'l1_db.json');
const L2_DB_PATH = path.join(ROOT, 'L2', 'db', 'l2_db.json');
const ARCHIVE_DB_DIR = path.join(ROOT, 'archive', 'db');

const MAX_UINT128 = 340282366920938463463374607431768211455n;

async function main() {
	if (!fs.existsSync(WALLETS_PATH)) {
		console.error('Wallets not found. Run wallet_generator.js first.');
		process.exit(1);
	}
	const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));

	// 1. Tạo thư mục
	fs.mkdirSync(path.dirname(L1_DB_PATH), { recursive: true });
	fs.mkdirSync(path.dirname(L2_DB_PATH), { recursive: true });
	fs.mkdirSync(ARCHIVE_DB_DIR, { recursive: true });

	// 2. Khởi tạo State Tree cho L2
	const poseidon = await getPoseidon();
	const F = poseidon.F;
	const cachePath = path.join(ROOT, 'ZK', 'circuits', 'zero_hashes_cache.json');
	const tree = new DenseMerkleTree(poseidon, 6, cachePath); // Depth = 6

	const l2Accounts = {
		Treasury: {
			pub_x: wallets.treasury.l2.publicKey.x,
			pub_y: wallets.treasury.l2.publicKey.y,
			balance: MAX_UINT128.toString(),
			nonce: '0',
			index: 0,
		},
		Alice: {
			pub_x: wallets.alice.l2.publicKey.x,
			pub_y: wallets.alice.l2.publicKey.y,
			balance: '0',
			nonce: '0',
			index: 1,
		},
		Bob: {
			pub_x: wallets.bob.l2.publicKey.x,
			pub_y: wallets.bob.l2.publicKey.y,
			balance: '0',
			nonce: '0',
			index: 2,
		},
		Operator: {
			pub_x: wallets.operator.l2.publicKey.x,
			pub_y: wallets.operator.l2.publicKey.y,
			balance: '0',
			nonce: '0',
			index: 3,
		},
	};

	// Insert accounts vào State Tree
	for (const acc of Object.values(l2Accounts)) {
		const leaf = poseidonHashArr(poseidon, [
			BigInt(acc.pub_x),
			BigInt(acc.pub_y),
			BigInt(acc.balance),
			BigInt(acc.nonce),
		]);
		tree.updateLeaf(acc.index, leaf);
	}

	const initialStateRoot = tree.getRoot();

	// 3. Ghi L2 DB
	const l2_db = {
		accounts: l2Accounts,
		transactions: [],
		system: {
			last_proven_tx_index: -1,
			last_processed_deposit_id: -1,
			merkle_tree: {
				nodes: tree.exportNodes(),
			},
		},
	};
	fs.writeFileSync(L2_DB_PATH, JSON.stringify(l2_db, null, 2));

	// 4. Ghi L1 DB
	const l1_db = {
		vault: {
			[wallets.alice.l1.address]: 100.0,
			[wallets.bob.l1.address]: 100.0,
			[wallets.operator.l1.address]: 0.0,
		},
		bridge_contract: {
			total_locked_eth: 0.0,
			current_state_root: initialStateRoot,
			batch_history: {},
			pending_deposits: [],
			claimed_nullifiers: {},
		},
	};
	fs.writeFileSync(L1_DB_PATH, JSON.stringify(l1_db, null, 2));

	console.log('[init_db] L1 & L2 database initialized.');
	console.log(`  L1 vault balances: Alice/Bob=100 ETH`);
	console.log(`  L2 Treasury balance: ${MAX_UINT128.toString()}`);
	console.log(`  Initial State Root: ${initialStateRoot}`);
}

main().catch(console.error);
