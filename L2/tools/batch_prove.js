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
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { getEddsa } from '../lib/eddsa.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import generateProof from '../../ZK/prove/index.js';

import { l2Store } from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const L1_CONTRACT_PATH = path.join(ROOT, 'L1', 'db', 'storage', 'contract_storage.json');
const INPUT_JSON_PATH = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup', 'input.json');
const OUTPUT_DIR = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup', 'output', 'plonk');
const CACHE_PATH = path.join(ROOT, 'ZK', 'circuits', 'zero_hashes_cache.json');

const CONFIG = {
	N_TXS: 4,
	DEPTH: 4,
};

async function main() {
	console.log(`\n======================================================`);
	console.log(`[Batch Prover] Bắt đầu quá trình Snapshot & Chứng minh Lô`);
	console.log(`======================================================\n`);

	const useCache = process.argv.includes('--cache');

	if (!fs.existsSync(L1_CONTRACT_PATH)) {
		console.error(
			`[Error] L1 contract_storage không tồn tại. Hãy chắc chắn Server đang chạy / đã init.`,
		);
		process.exit(1);
	}
	const l2_db = l2Store.data;
	const l1_contract = JSON.parse(fs.readFileSync(L1_CONTRACT_PATH, 'utf8'));

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

	let simAccounts = {};
	if (l2_db.proven_accounts) {
		const temp = JSON.parse(JSON.stringify(l2_db.proven_accounts));
		for (const key in temp) {
			simAccounts[key] = temp[key];
			simAccounts[key].balance = BigInt(temp[key].balance);
			simAccounts[key].nonce = BigInt(temp[key].nonce);
		}
	} else {
		console.error('Lỗi: Không tìm thấy proven_accounts. Hãy chạy lại node tools/init_db.js');
		process.exit(1);
	}

	// hashLeaf nhận pub_x từ key (không có trong value nữa)
	const hashLeaf = (pub_x, acc) =>
		poseidonHashArr(poseidon, [BigInt(pub_x), BigInt(acc.pub_y), acc.balance, acc.nonce]);

	for (const [pub_x, acc] of Object.entries(simAccounts)) {
		tree.updateLeaf(acc.index, hashLeaf(pub_x, acc));
	}

	// Sync new accounts from L2 DB that aren't in proven_accounts yet
	for (const [pub_x, acc] of Object.entries(l2_db.accounts)) {
		if (!simAccounts[pub_x]) {
			simAccounts[pub_x] = {
				pub_y: acc.pub_y,
				balance: 0n,
				nonce: 0n,
				index: acc.index,
			};
			tree.updateLeaf(acc.index, hashLeaf(pub_x, simAccounts[pub_x]));
		}
	}

	// KHÔNG CẦN CHẠY O(N) VÒNG LẶP TRANSACTION NỮA
	// simAccounts (proven_accounts) chính là State hiện tại ngay trước khi Proof batch mới

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
		old_operations_hash: l1_contract.last_operations_hash || '0',
		txs_enabled: [],
		txs_type: [],
		txs_from_x: [],
		txs_from_y: [],
		txs_to_x: [],
		txs_to_y: [],
		txs_amount: [],
		txs_fee: [],
		txs_nonce: [],
		txs_l1_address: [],
		txs_deposit_id: [],
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
	let currentOpsHash = BigInt(l1_contract.last_operations_hash || '0');

	for (let i = 0; i < CONFIG.N_TXS; i++) {
		let isPadding = i >= availableTxs.length;
		let enabled = isPadding ? 0n : 1n;

		// Hằng số padding: [0,0,0,0] sẽ tạo ra EMPTY_LEAF
		// Đảm bảo Alice key check EdDSA hợp lệ ngay cả khi enabled=0
		let tx = isPadding
			? {
					type: 0,
					from_x: wallets.treasury.l2.publicKey.x,
					from_y: wallets.treasury.l2.publicKey.y,
					to_x: '0',
					to_y: '0',
					amount: '0',
					fee: '0',
					nonce: '0',
					l1_address: '0',
					deposit_id: -1,
				}
			: availableTxs[i];

		let type = BigInt(tx.type === 'deposit' ? 1 : tx.type || 0);
		let amount = BigInt(tx.amount);
		let fee = BigInt(tx.fee);
		let old_nonce = BigInt(tx.nonce);
		let l1_address = BigInt(tx.l1_address || 0);
		let deposit_id = BigInt(tx.deposit_id ?? -1);

		let s = simAccounts[tx.from_x];
		let r = isPadding ? { pub_y: '0', balance: 0n, nonce: 0n, index: 0 } : simAccounts[tx.to_x];

		let senderPath = getPath(s.index);
		inputJson.sender_balances.push(s.balance.toString());
		inputJson.sender_nonces.push(s.nonce.toString());
		inputJson.sender_pathElements.push(senderPath.pathElements);
		inputJson.sender_pathIndices.push(senderPath.pathIndices);

		if (enabled === 1n) {
			s.balance = s.balance - amount - fee;
			s.nonce = s.nonce + 1n;
			tree.updateLeaf(s.index, hashLeaf(tx.from_x, s));
		}

		let receiverPath = getPath(r.index);
		inputJson.receiver_pubKey_x.push(isPadding ? '0' : tx.to_x);
		inputJson.receiver_pubKey_y.push(r.pub_y);
		inputJson.receiver_balances.push(r.balance.toString());
		inputJson.receiver_nonces.push(r.nonce.toString());
		inputJson.receiver_pathElements.push(receiverPath.pathElements);
		inputJson.receiver_pathIndices.push(receiverPath.pathIndices);

		if (enabled === 1n) {
			r.balance = r.balance + amount;
			tree.updateLeaf(r.index, hashLeaf(tx.to_x, r));
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
			// Lệnh Deposit => Treasury Signed (9 fields)
			let treasuryPrivKey = wallets.treasury.l2.privateKey;
			let msgHash = poseidon([
				type,
				BigInt(tx.from_x),
				BigInt(tx.from_y),
				BigInt(tx.to_x),
				BigInt(tx.to_y),
				amount,
				fee,
				old_nonce,
				l1_address,
			]);
			let sig = eddsa.signPoseidon(Buffer.from(treasuryPrivKey, 'hex'), msgHash);
			R8x = F.toString(sig.R8[0]);
			R8y = F.toString(sig.R8[1]);
			S = sig.S.toString();
		} else if (enabled === 0n) {
			// Re-sign padding tx cho Treasury (9 fields)
			let privKey = wallets.treasury.l2.privateKey;
			let msgHash = poseidon([
				type,
				BigInt(tx.from_x),
				BigInt(tx.from_y),
				BigInt('0'),
				BigInt('0'),
				amount,
				fee,
				old_nonce,
				BigInt('0'),
			]);
			let sig = eddsa.signPoseidon(Buffer.from(privKey, 'hex'), msgHash);
			R8x = F.toString(sig.R8[0]);
			R8y = F.toString(sig.R8[1]);
			S = sig.S.toString();
		}

		inputJson.txs_enabled.push(enabled.toString());
		inputJson.txs_type.push(type.toString());
		inputJson.txs_from_x.push(tx.from_x);
		inputJson.txs_from_y.push(tx.from_y);
		inputJson.txs_to_x.push(isPadding ? '0' : tx.to_x);
		inputJson.txs_to_y.push(isPadding ? '0' : tx.to_y);
		inputJson.txs_amount.push(amount.toString());
		inputJson.txs_fee.push(fee.toString());
		inputJson.txs_nonce.push(old_nonce.toString());
		inputJson.txs_l1_address.push(l1_address.toString());
		inputJson.txs_deposit_id.push(deposit_id.toString());
		inputJson.txs_sig_R8x.push(R8x);
		inputJson.txs_sig_R8y.push(R8y);
		inputJson.txs_sig_S.push(S);

		// DA Hash (9 fields)
		const daHash = poseidon([
			type,
			BigInt(tx.from_x),
			BigInt(tx.from_y),
			BigInt(isPadding ? '0' : tx.to_x),
			BigInt(isPadding ? '0' : tx.to_y),
			amount,
			fee,
			old_nonce,
			l1_address,
		]);
		daHashesForTree.push(daHash);

		// Operations Hash
		if (enabled === 1n && type === 1n) {
			currentOpsHash = poseidon([currentOpsHash, deposit_id, BigInt(tx.to_x), BigInt(tx.to_y), amount]);
		}
	}

	const operatorPubX = wallets.operator.l2.publicKey.x;
	let op = simAccounts[operatorPubX];
	let opPath = getPath(op.index);
	inputJson.operator_pub_x = operatorPubX;
	inputJson.operator_pub_y = op.pub_y;
	inputJson.operator_balance_old = op.balance.toString();
	inputJson.operator_nonce = op.nonce.toString();
	inputJson.operator_pathElements = opPath.pathElements;
	inputJson.operator_pathIndices = opPath.pathIndices;

	op.balance += cumulativeFee;
	tree.updateLeaf(op.index, hashLeaf(operatorPubX, op));

	const newStateRoot = tree.getRoot();
	inputJson.newStateRoot = newStateRoot;

	// Tính DA Tree Root
	let n_nodes = CONFIG.N_TXS - 1;
	let node_hashes = new Array(2 * CONFIG.N_TXS - 1).fill(0n);
	for (let i = 0; i < CONFIG.N_TXS; i++) node_hashes[n_nodes + i] = daHashesForTree[i];
	for (let i = n_nodes - 1; i >= 0; i--) node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
	const daTreeRoot = F.toString(node_hashes[0]);

	const pHash = poseidon([BigInt(oldStateRoot), BigInt(newStateRoot), BigInt(daTreeRoot), currentOpsHash]);
	inputJson.publicInputHash = F.toString(pHash);

	fs.writeFileSync(INPUT_JSON_PATH, JSON.stringify(inputJson, null, 2));
	console.log(`[Batch Prover] Đã tạo xong input.json cho mạch.`);
	console.log(`[Batch Prover] Old Root: ${oldStateRoot}`);
	console.log(`[Batch Prover] New Root: ${newStateRoot}`);
	console.log(`[Batch Prover] DA Root:  ${daTreeRoot}`);

	if (!useCache) {
		console.log(`\n[Batch Prover] Đang chạy sinh bằng chứng Plonk (có thể mất 15-30s)...`);
		const circuitDir = path.join(ROOT, 'ZK', 'circuits', 'prove_rollup');
		const success = generateProof(circuitDir, 'plonk');

		if (!success) {
			console.error(`[Batch Prover] Sinh Proof THẤT BẠI. Dừng tại đây.`);
			process.exit(1);
		}
	} else {
		console.log(
			`\n[Batch Prover] [CACHE MODE] Bỏ qua bước sinh Proof. Sử dụng proof.json có sẵn để gửi lên Sequencer...`,
		);
	}

	console.log(`\n[Batch Prover] Tiến hành Gửi lên Sequencer để Relay...`);
	const proofRaw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'proof.json'), 'utf8'));
	const publicSigsRaw = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'public.json'), 'utf8'));

	const numDeposits = availableTxs.filter((tx) => tx.type === 1 || tx.type === 'deposit').length;

	// Serializing bigints before passing through payload JSON
	for (let k in simAccounts) {
		simAccounts[k].balance = simAccounts[k].balance.toString();
		simAccounts[k].nonce = simAccounts[k].nonce.toString();
	}

	const payload = {
		proof: proofRaw,
		publicSignals: publicSigsRaw,
		oldStateRoot,
		newStateRoot,
		daRoot: daTreeRoot,
		num_deposits: numDeposits,
		transactions: availableTxs,
		new_proven_accounts: simAccounts,
	};

	console.log('L2 ALL LEAVES:', daHashesForTree);
	console.log('AVAILABLE TXS:', availableTxs);
	try {
		const response = await fetch('http://localhost:5000/l2/batch/submit-proof', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const data = await response.json();

		if (response.ok) {
			console.log(`[Batch Prover] Giao tiếp thành công! Batch #${data.batch_id} đã được lưu trên chuỗi.`);
		} else {
			console.error(`[Batch Prover] Lỗi từ Server L2/L1:`, data);
		}
	} catch (e) {
		console.error(`[Batch Prover] Lỗi mạng khi gọi API submit (Servers đã bật chưa?):`, e.message);
	}
}

main().catch(console.error);
