/**
 * tools/batch_prove.js
 *
 * Chạy thủ công để đóng Lô (Batch) trên L2, sinh Proof cục bộ, rồi nạp Proof vào hệ thống.
 *
 * 1. Snapshot giao dịch chưa Prove từ L2 state (cắt đúng N_TXS hoặc padding)
 * 2. Cập nhật Merkle Tree L2 và tạo file `input.json`
 * 3. Chạy quá trình sinh ZK-Proof (Plonk) cục bộ tương tự luồng prove/index.js
 * 4. Submit Proof + DA Blob + PublicSignals lên API `POST /l2/batch/submit-proof`
 *    để Sequencer đẩy lên L1 + Archive.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPoseidon, poseidonHashArr } from './poseidon.js';
import { getEddsa } from '../L2/lib/eddsa.js';
import { DenseMerkleTree } from './merkle_tree.js';
import generateProof from '../ZK/prove/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const L2_DB_PATH = path.join(ROOT, 'L2', 'db', 'l2_db.json');
const INPUT_JSON_PATH = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup', 'input.json');
const OUTPUT_DIR = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup', 'output', 'plonk');
const CACHE_PATH = path.join(ROOT, 'ZK', 'circuits', 'zero_hashes_cache.json');

const CONFIG = {
	N_TXS: 4,
	DEPTH: 6,
};

async function main() {
	console.log(`\n======================================================`);
	console.log(`[Batch Prover] Bắt đầu quá trình Snapshot & Chứng minh Lô`);
	console.log(`======================================================\n`);

	if (!fs.existsSync(L2_DB_PATH)) {
		console.error(`[Error] L2 DB không tồn tại. Hãy chắc chắn L2 Server đang chạy / đã init.`);
		process.exit(1);
	}
	const l2_db = JSON.parse(fs.readFileSync(L2_DB_PATH, 'utf8'));

	let startIndex = l2_db.system.last_proven_tx_index + 1;
	let availableTxs = l2_db.transactions.slice(startIndex, startIndex + CONFIG.N_TXS);

	if (availableTxs.length === 0) {
		console.log(`[Batch Prover] Không có giao dịch nào mới để đóng Lô.`);
		process.exit(0);
	}

	console.log(
		`[Batch Prover] Snapshot ${availableTxs.length} giao dịch... (Cần pad thêm ${CONFIG.N_TXS - availableTxs.length} TXs Ảo)`,
	);

	const poseidon = await getPoseidon();
	const eddsa = await getEddsa();
	const F = poseidon.F;

	const tree = new DenseMerkleTree(poseidon, CONFIG.DEPTH, CACHE_PATH);
	const wallets = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'wallets.json'), 'utf8'));

	const MAX_UINT128 = 340282366920938463463374607431768211455n;

	let simAccounts = {
		Treasury: {
			pub_x: wallets.treasury.l2.publicKey.x,
			pub_y: wallets.treasury.l2.publicKey.y,
			balance: MAX_UINT128,
			nonce: 0n,
			index: 0,
		},
		Alice: {
			pub_x: wallets.alice.l2.publicKey.x,
			pub_y: wallets.alice.l2.publicKey.y,
			balance: 0n,
			nonce: 0n,
			index: 1,
		},
		Bob: { pub_x: wallets.bob.l2.publicKey.x, pub_y: wallets.bob.l2.publicKey.y, balance: 0n, nonce: 0n, index: 2 },
		Operator: {
			pub_x: wallets.operator.l2.publicKey.x,
			pub_y: wallets.operator.l2.publicKey.y,
			balance: 0n,
			nonce: 0n,
			index: 3,
		},
	};

	const hashLeaf = (acc) => poseidonHashArr(poseidon, [BigInt(acc.pub_x), BigInt(acc.pub_y), acc.balance, acc.nonce]);

	for (const key in simAccounts) {
		tree.updateLeaf(simAccounts[key].index, hashLeaf(simAccounts[key]));
	}

	// L2 DB accounts could be dynamically created, let's sync ALL L2 DB accounts into simAccounts!
	const db_accounts_list = Object.values(l2_db.accounts);
	for (const acc of db_accounts_list) {
		let exists = Object.values(simAccounts).find((a) => a.pub_x === acc.pub_x && a.pub_y === acc.pub_y);
		if (!exists) {
			simAccounts[`UID_${acc.index}`] = {
				pub_x: acc.pub_x,
				pub_y: acc.pub_y,
				balance: 0n,
				nonce: 0n,
				index: acc.index,
			};
			tree.updateLeaf(acc.index, hashLeaf({ pub_x: acc.pub_x, pub_y: acc.pub_y, balance: 0n, nonce: 0n }));
		}
	}

	// Apply tất cả TX từ 0 đến startIndex
	for (let i = 0; i < startIndex; i++) {
		let tx = l2_db.transactions[i];
		let s = Object.values(simAccounts).find((a) => a.pub_x === tx.from_x && a.pub_y === tx.from_y);
		let r = Object.values(simAccounts).find((a) => a.pub_x === tx.to_x && a.pub_y === tx.to_y);
		s.balance -= BigInt(tx.amount) + BigInt(tx.fee);
		s.nonce += 1n;
		r.balance += BigInt(tx.amount);
		simAccounts.Operator.balance += BigInt(tx.fee);

		tree.updateLeaf(s.index, hashLeaf(s));
		tree.updateLeaf(r.index, hashLeaf(r));
		tree.updateLeaf(simAccounts.Operator.index, hashLeaf(simAccounts.Operator));
	}

	const oldStateRoot = tree.getRoot();

	const getPath = (index) => {
		let addrBits = BigInt(index).toString(2).padStart(CONFIG.DEPTH, '0').split('').reverse().map(Number);
		let currentIndex = BigInt(index);
		let pathElements = [];
		for (let i = 0; i < CONFIG.DEPTH; i++) {
			let isRight = addrBits[i];
			let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;
			let siblingHash = tree.nodes[`${i},${siblingIndex}`];
			if (siblingHash === undefined) {
				pathElements.push(F.toString(tree.zeros[i]));
			} else {
				pathElements.push(typeof siblingHash === 'string' ? siblingHash : F.toString(siblingHash));
			}
			currentIndex = currentIndex / 2n;
		}
		return { pathElements, pathIndices: addrBits };
	};

	const inputJson = {
		oldStateRoot: oldStateRoot,
		txs_enabled: [],
		txs_from_x: [],
		txs_from_y: [],
		txs_to_x: [],
		txs_to_y: [],
		txs_amount: [],
		txs_fee: [],
		txs_nonce: [],
		txs_sig_R8x: [],
		txs_sig_R8y: [],
		txs_sig_S: [],
		sender_balances: [],
		sender_nonces: [],
		receiver_pubKey_x: [],
		receiver_pubKey_y: [],
		receiver_balances: [],
		receiver_nonces: [],
		sender_pathElements: [],
		sender_pathIndices: [],
		receiver_pathElements: [],
		receiver_pathIndices: [],
	};

	let daHashesForTree = [];
	let cumulativeFee = 0n;

	for (let i = 0; i < CONFIG.N_TXS; i++) {
		let isPadding = i >= availableTxs.length;
		let enabled = isPadding ? 0n : 1n;

		// Hằng số padding: [0,0,0,0] sẽ tạo ra EMPTY_LEAF
		// Đảm bảo Alice key check EdDSA hợp lệ ngay cả khi enabled=0
		let tx = isPadding
			? {
					from_x: simAccounts.Alice.pub_x,
					from_y: simAccounts.Alice.pub_y,
					to_x: '0',
					to_y: '0',
					amount: '0',
					fee: '0',
					nonce: '0',
				}
			: availableTxs[i];

		let amount = BigInt(tx.amount);
		let fee = BigInt(tx.fee);
		let old_nonce = BigInt(tx.nonce);

		let s = Object.values(simAccounts).find((a) => a.pub_x === tx.from_x && a.pub_y === tx.from_y);
		// Với dummy tx, r có thể bị undefined vì hệ thống không có acc với pubKey "0".
		// Tuy nhiên ta chỉ dùng r.pub_x, r.pub_y, v.v..
		let r = isPadding
			? { pub_x: '0', pub_y: '0', balance: 0n, nonce: 0n, index: 0 }
			: Object.values(simAccounts).find((a) => a.pub_x === tx.to_x && a.pub_y === tx.to_y);

		let senderPath = getPath(s.index);
		inputJson.sender_balances.push(s.balance.toString());
		inputJson.sender_nonces.push(s.nonce.toString());
		inputJson.sender_pathElements.push(senderPath.pathElements);
		inputJson.sender_pathIndices.push(senderPath.pathIndices);

		if (enabled === 1n) {
			s.balance = s.balance - amount - fee;
			s.nonce = s.nonce + 1n;
			tree.updateLeaf(s.index, hashLeaf(s));
		}

		let receiverPath = getPath(r.index);
		inputJson.receiver_pubKey_x.push(r.pub_x);
		inputJson.receiver_pubKey_y.push(r.pub_y);
		inputJson.receiver_balances.push(r.balance.toString());
		inputJson.receiver_nonces.push(r.nonce.toString());
		inputJson.receiver_pathElements.push(receiverPath.pathElements);
		inputJson.receiver_pathIndices.push(receiverPath.pathIndices);

		if (enabled === 1n) {
			r.balance = r.balance + amount;
			tree.updateLeaf(r.index, hashLeaf(r));
			cumulativeFee += fee;
		}

		let R8x = '0',
			R8y = '0',
			S = '0';
		if (enabled === 1n && tx.sig_S !== '0') {
			// Lệnh Transfer thuần tuý
			R8x = tx.sig_R8x;
			R8y = tx.sig_R8y;
			S = tx.sig_S;
		} else if (enabled === 1n && tx.sig_S === '0') {
			// Lệnh Deposit => Treasury Signed
			let treasuryPrivKey = wallets.treasury.l2.privateKey;
			let msgHash = poseidon([poseidon([BigInt(r.pub_x), BigInt(r.pub_y)]), amount, fee, old_nonce]);
			let sig = eddsa.signPoseidon(Buffer.from(treasuryPrivKey, 'hex'), msgHash);
			R8x = F.toString(sig.R8[0]);
			R8y = F.toString(sig.R8[1]);
			S = sig.S.toString();
		} else if (enabled === 0n) {
			// Re-sign padding tx cho Alice
			let privKeys = { Alice: wallets.alice.l2.privateKey };
			let msgHash = poseidon([poseidon([BigInt('0'), BigInt('0')]), amount, fee, old_nonce]);
			let sig = eddsa.signPoseidon(Buffer.from(privKeys['Alice'], 'hex'), msgHash);
			R8x = F.toString(sig.R8[0]);
			R8y = F.toString(sig.R8[1]);
			S = sig.S.toString();
		}

		inputJson.txs_enabled.push(enabled.toString());
		inputJson.txs_from_x.push(s.pub_x);
		inputJson.txs_from_y.push(s.pub_y);
		inputJson.txs_to_x.push(r.pub_x);
		inputJson.txs_to_y.push(r.pub_y);
		inputJson.txs_amount.push(amount.toString());
		inputJson.txs_fee.push(fee.toString());
		inputJson.txs_nonce.push(old_nonce.toString());
		inputJson.txs_sig_R8x.push(R8x);
		inputJson.txs_sig_R8y.push(R8y);
		inputJson.txs_sig_S.push(S);

		// DA Hash của padding tx phải đồng nhất với kết quả nội tại do Circom băm trên msg_hash
		const rxHash = poseidon([BigInt(r.pub_x), BigInt(r.pub_y)]);
		const daHash = poseidon([rxHash, amount, fee, old_nonce]);
		daHashesForTree.push(daHash);
	}

	let opPath = getPath(simAccounts.Operator.index);
	inputJson.operator_pub_x = simAccounts.Operator.pub_x;
	inputJson.operator_pub_y = simAccounts.Operator.pub_y;
	inputJson.operator_balance_old = simAccounts.Operator.balance.toString();
	inputJson.operator_nonce = simAccounts.Operator.nonce.toString();
	inputJson.operator_pathElements = opPath.pathElements;
	inputJson.operator_pathIndices = opPath.pathIndices;

	simAccounts.Operator.balance += cumulativeFee;
	tree.updateLeaf(simAccounts.Operator.index, hashLeaf(simAccounts.Operator));

	const newStateRoot = tree.getRoot();
	inputJson.newStateRoot = newStateRoot;

	// Tính DA Tree Root
	let n_nodes = CONFIG.N_TXS - 1;
	let node_hashes = new Array(2 * CONFIG.N_TXS - 1).fill(0n);
	for (let i = 0; i < CONFIG.N_TXS; i++) node_hashes[n_nodes + i] = daHashesForTree[i];
	for (let i = n_nodes - 1; i >= 0; i--) node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
	const daTreeRoot = F.toString(node_hashes[0]);

	const pHash = poseidon([BigInt(oldStateRoot), BigInt(newStateRoot), BigInt(daTreeRoot)]);
	inputJson.publicInputHash = F.toString(pHash);

	fs.writeFileSync(INPUT_JSON_PATH, JSON.stringify(inputJson, null, 2));
	console.log(`[Batch Prover] Đã tạo xong input.json cho mạch.`);
	console.log(`[Batch Prover] Old Root: ${oldStateRoot}`);
	console.log(`[Batch Prover] New Root: ${newStateRoot}`);
	console.log(`[Batch Prover] DA Root:  ${daTreeRoot}`);

	console.log(`\n[Batch Prover] Đang chạy sinh bằng chứng Plonk (có thể mất 15-30s)...`);
	const circuitDir = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup');
	const success = generateProof(circuitDir, 'plonk');

	if (!success) {
		console.error(`[Batch Prover] Sinh Proof THẤT BẠI. Dừng tại đây.`);
		process.exit(1);
	}

	console.log(`\n[Batch Prover] Proof thành công! Gửi lên Sequencer để Relay...`);
	const proofRaw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'proof.json'), 'utf8'));
	const publicSigsRaw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'public.json'), 'utf8'));

	const payload = {
		proof: proofRaw,
		publicSignals: publicSigsRaw,
		oldStateRoot,
		newStateRoot,
		daRoot: daTreeRoot,
		transactions: availableTxs,
	};

	try {
		const response = await fetch('http://localhost:5000/l2/batch/submit-proof', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const data = await response.json();

		if (response.ok) {
			console.log(`[Batch Prover] 🟢 Giao tiếp thành công! Batch #${data.batch_id} đã được lưu trên chuỗi.`);
		} else {
			console.error(`[Batch Prover] 🔴 Lỗi từ Server L2/L1:`, data);
		}
	} catch (e) {
		console.error(`[Batch Prover] Lỗi mạng khi gọi API submit (Servers đã bật chưa?):`, e.message);
	}
}

main().catch(console.error);
