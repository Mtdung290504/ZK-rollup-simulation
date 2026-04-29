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
const L1_STORAGE_DIR = path.join(ROOT, 'L1', 'db', 'storage');
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
	fs.mkdirSync(L1_STORAGE_DIR, { recursive: true });
	fs.mkdirSync(path.dirname(L2_DB_PATH), { recursive: true });
	fs.mkdirSync(ARCHIVE_DB_DIR, { recursive: true });

	// 2. Khởi tạo State Tree cho L2
	const poseidon = await getPoseidon();
	const F = poseidon.F;
	const cachePath = path.join(ROOT, 'ZK', 'circuits', 'zero_hashes_cache.json');
	const tree = new DenseMerkleTree(poseidon, 4, cachePath); // Depth = 4

	/**
	 * Tạo account entry với key = pub_x
	 * @param {{x: string, y: string}} pubKey
	 * @param {string} balance
	 * @param {number} index
	 * @param {string|null} userName
	 */
	function makeAccount(pubKey, balance, index, userName) {
		return {
			[pubKey.x]: {
				pub_y: pubKey.y,
				balance,
				nonce: '0',
				index,
				__user_name__: userName ?? null,
			},
		};
	}

	const l2Accounts = {
		...makeAccount(wallets.treasury.l2.publicKey, MAX_UINT128.toString(), 0, 'Treasury'),
		...makeAccount(wallets.alice.l2.publicKey, '0', 1, 'Alice'),
		...makeAccount(wallets.bob.l2.publicKey, '0', 2, 'Bob'),
		...makeAccount(wallets.operator.l2.publicKey, '0', 3, 'Operator'),
	};

	// Insert accounts vào State Tree
	for (const [pub_x, acc] of Object.entries(l2Accounts)) {
		const leaf = poseidonHashArr(poseidon, [
			BigInt(pub_x),
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
		proven_accounts: JSON.parse(JSON.stringify(l2Accounts)),
		transactions: [],
		system: {
			last_proven_tx_index: -1,
			last_synced_deposit_id: -1,
			last_proven_deposit_id: -1,
			merkle_tree: {
				nodes: tree.exportNodes(),
			},
		},
	};
	fs.writeFileSync(L2_DB_PATH, JSON.stringify(l2_db, null, 2));

	// 4. Ghi L1 DB (3 file tách biệt)
	const chainEnvData = {
		vault: {
			[wallets.alice.l1.address]: 100.0,
			[wallets.bob.l1.address]: 100.0,
			[wallets.operator.l1.address]: 0.0,
		},
	};

	const contractStorageData = {
		total_locked_eth: 0.0,
		current_state_root: initialStateRoot,
		last_operations_hash: '0',
		last_proven_deposit_id: -1,
		batch_history: {},
		pending_deposits: [],
		claimed_nullifiers: {},
	};

	const eventLogData = {
		deposit_events: [],
		batch_events: [],
	};

	fs.writeFileSync(path.join(L1_STORAGE_DIR, 'chain_env.json'), JSON.stringify(chainEnvData, null, 2));
	fs.writeFileSync(path.join(L1_STORAGE_DIR, 'contract_storage.json'), JSON.stringify(contractStorageData, null, 2));
	fs.writeFileSync(path.join(L1_STORAGE_DIR, 'event_log.json'), JSON.stringify(eventLogData, null, 2));

	// 5. Ghi Archive DB
	const archiveDbPath = path.join(ARCHIVE_DB_DIR, 'archive.json');
	fs.writeFileSync(archiveDbPath, JSON.stringify({ batches: {} }, null, 2));

	console.log('[init_db] L1, L2 & Archive database initialized.');
	console.log(`  L1 vault balances: Alice/Bob=100 ETH`);
	console.log(`  L2 Treasury balance: ${MAX_UINT128.toString()}`);
	console.log(`  Initial State Root: ${initialStateRoot}`);
}

main().catch(console.error);
