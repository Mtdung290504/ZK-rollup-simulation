// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { buildPoseidon, buildEddsa } from 'circomlibjs';

// ======================================================================
// CONFIGURATION & CONSTANTS (CẤU HÌNH & HẰNG SỐ)
// ======================================================================

// 1. Cấu hình Mạng lưới ZK-Rollup (BẮT BUỘC KHỚP VỚI index.circom)
const CONFIG = {
	DEPTH: 6, // Độ sâu của Cây Merkle Trạng thái (State Tree)
	N_TXS: 4, // Số lượng giao dịch trong 1 lô (Batch). Bắt buộc là lũy thừa của 2 (VD: 4, 8, 16).
};

// 2. Đường dẫn File Lưu/Đọc
const PATHS = {
	// Nơi lưu trữ bộ nhớ đệm (cache) của các lá rỗng SMT
	CACHE_ZERO_HASHES: path.join(process.cwd(), 'ZK/circuits/zero_hashes_cache.json'),

	// Nơi xả dữ liệu JSON để mạch Circom đọc vào
	OUTPUT_INPUT_JSON: path.join(process.cwd(), 'ZK/circuits/prove_rollup/input.json'), // Thay đổi đường dẫn thực tế của bạn tại đây
};

// 3. Khóa Bí Mật (Private Keys) cho Môi trường Test
const PRIVATE_KEYS = {
	ALICE: Buffer.from('01'.repeat(32), 'hex'),
	BOB: Buffer.from('02'.repeat(32), 'hex'),
	OPERATOR: Buffer.from('03'.repeat(32), 'hex'),
};

// 4. Số dư Khởi tạo ban đầu (Initial Balances)
const INITIAL_STATE = {
	ALICE_BALANCE: 10000n,
	BOB_BALANCE: 5000n,
	OPERATOR_BALANCE: 0n,
};

// 5. Mẫu Giao dịch Test (Mock Transaction Template)
// Lưu ý: Đây là kịch bản giả lập 2 giao dịch THẬT và các giao dịch CÒN LẠI là PADDING (ẢO).
const MOCK_TX = {
	REAL_AMOUNT: -10n,
	REAL_FEE: 1n,
	PADDING_AMOUNT: 0n,
	PADDING_FEE: 0n,
	NUM_REAL_TXS: 2, // Số giao dịch thật muốn test (phải <= CONFIG.N_TXS)
};

// ======================================================================
// MODULE 1: SMT PRECOMPUTATION (CACHE ZERO HASHES)
// ======================================================================
function getZeroHashes(poseidon, depth) {
	let zeros = [];
	const emptyLeaf = poseidon([0n, 0n, 0n, 0n]);

	if (fs.existsSync(PATHS.CACHE_ZERO_HASHES)) {
		try {
			const cachedData = JSON.parse(fs.readFileSync(PATHS.CACHE_ZERO_HASHES, 'utf8'));
			if (cachedData.length >= depth + 1) {
				console.log(`[Cache] Đã tải thành công ${depth + 1} tầng Zero Hashes từ: ${PATHS.CACHE_ZERO_HASHES}`);
				return cachedData.slice(0, depth + 1).map((x) => poseidon.F.e(x));
			} else {
				console.log(
					`[Cache] Cache hiện tại (depth ${cachedData.length - 1}) quá nông so với yêu cầu (depth ${depth}). Tính toán lại...`,
				);
			}
		} catch (e) {
			console.log(`[Cache] Lỗi đọc file cache, tiến hành tính toán lại...`);
		}
	}

	console.log(`[Tính toán] Đang tính toán Zero Hashes cho Cây Merkle độ sâu ${depth}...`);
	zeros.push(emptyLeaf);
	for (let i = 0; i < depth; i++) {
		zeros.push(poseidon([zeros[i], zeros[i]]));
	}

	const stringifiedZeros = zeros.map((x) => poseidon.F.toString(x));
	fs.writeFileSync(PATHS.CACHE_ZERO_HASHES, JSON.stringify(stringifiedZeros, null, 2));
	console.log(`[Cache] Đã lưu Zero Hashes mới vào: ${PATHS.CACHE_ZERO_HASHES}`);

	return zeros;
}

// ======================================================================
// MAIN SEQUENCER LOGIC (CHƯƠNG TRÌNH CHÍNH)
// ======================================================================
async function main() {
	const poseidon = await buildPoseidon();
	const eddsa = await buildEddsa();
	const F = poseidon.F;

	// --- Helper Functions ---
	const hash = (left, right) => poseidon([left, right]);
	const hashArr = (inputs) => poseidon(inputs);
	const toBig = (val) => BigInt(F.toString(val));
	const getAddress = (pubX, pubY) => hashArr([pubX, pubY]);
	const getLeaf = (pubX, pubY, balance, nonce) => hashArr([pubX, pubY, F.e(balance), F.e(nonce)]);
	const getIndex = (addr) => toBig(addr) & ((1n << BigInt(CONFIG.DEPTH)) - 1n);

	// --- State Tree Database ---
	const zeros = getZeroHashes(poseidon, CONFIG.DEPTH);
	let treeNodes = {};

	function getPath(addr) {
		let index = getIndex(addr);
		let addrBits = index.toString(2).padStart(CONFIG.DEPTH, '0').split('').reverse().map(Number);
		let pathElements = [];
		let currentIndex = index;

		for (let i = 0; i < CONFIG.DEPTH; i++) {
			let isRight = addrBits[i];
			let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;
			let siblingHash = treeNodes[`${i},${siblingIndex}`];

			if (siblingHash === undefined) siblingHash = zeros[i];

			pathElements.push(F.toString(siblingHash));
			currentIndex = currentIndex / 2n;
		}
		return { pathElements, pathIndices: addrBits };
	}

	function updateTree(addr, leafValue) {
		let index = getIndex(addr);
		let addrBits = index.toString(2).padStart(CONFIG.DEPTH, '0').split('').reverse().map(Number);
		let currentIndex = index;

		treeNodes[`0,${currentIndex}`] = leafValue;
		let currentHash = leafValue;

		for (let i = 0; i < CONFIG.DEPTH; i++) {
			let isRight = addrBits[i];
			let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;
			let siblingHash = treeNodes[`${i},${siblingIndex}`];

			if (siblingHash === undefined) siblingHash = zeros[i];

			let left = isRight ? siblingHash : currentHash;
			let right = isRight ? currentHash : siblingHash;

			currentHash = hash(left, right);
			currentIndex = currentIndex / 2n;
			treeNodes[`${i + 1},${currentIndex}`] = currentHash;
		}
		return currentHash;
	}

	const getRoot = () => {
		let root = treeNodes[`${CONFIG.DEPTH},0`];
		return root !== undefined ? F.toString(root) : F.toString(zeros[CONFIG.DEPTH]);
	};

	// --- 1. Khởi tạo Accounts ---
	const pubA = eddsa.prv2pub(PRIVATE_KEYS.ALICE);
	const pubB = eddsa.prv2pub(PRIVATE_KEYS.BOB);
	const pubOp = eddsa.prv2pub(PRIVATE_KEYS.OPERATOR);

	let state = {
		Alice: {
			x: pubA[0],
			y: pubA[1],
			balance: INITIAL_STATE.ALICE_BALANCE,
			nonce: 0n,
			address: getAddress(pubA[0], pubA[1]),
		},
		Bob: {
			x: pubB[0],
			y: pubB[1],
			balance: INITIAL_STATE.BOB_BALANCE,
			nonce: 0n,
			address: getAddress(pubB[0], pubB[1]),
		},
		Op: {
			x: pubOp[0],
			y: pubOp[1],
			balance: INITIAL_STATE.OPERATOR_BALANCE,
			nonce: 0n,
			address: getAddress(pubOp[0], pubOp[1]),
		},
	};

	// Nạp State khởi đầu vào Cây
	updateTree(state.Alice.address, getLeaf(state.Alice.x, state.Alice.y, state.Alice.balance, state.Alice.nonce));
	updateTree(state.Bob.address, getLeaf(state.Bob.x, state.Bob.y, state.Bob.balance, state.Bob.nonce));
	updateTree(state.Op.address, getLeaf(state.Op.x, state.Op.y, state.Op.balance, state.Op.nonce));

	// Khung sườn file input.json
	const inputJson = {
		oldStateRoot: getRoot(),
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

	console.log(`[Bắt đầu] Đang xử lý lô ${CONFIG.N_TXS} giao dịch (Alice chuyển cho Bob)...`);

	// --- 2. Xử lý Lô Giao Dịch ---
	for (let i = 0; i < CONFIG.N_TXS; i++) {
		let isPadding = i >= MOCK_TX.NUM_REAL_TXS;
		let enabled = isPadding ? 0n : 1n;
		let amount = isPadding ? MOCK_TX.PADDING_AMOUNT : MOCK_TX.REAL_AMOUNT;
		let fee = isPadding ? MOCK_TX.PADDING_FEE : MOCK_TX.REAL_FEE;

		let s = state.Alice;
		let r = state.Bob;
		let old_nonce = s.nonce;

		// Trích xuất Merkle Path CŨ của Sender
		let senderPath = getPath(s.address);
		inputJson.sender_balances.push(s.balance.toString());
		inputJson.sender_nonces.push(old_nonce.toString());
		inputJson.sender_pathElements.push(senderPath.pathElements);
		inputJson.sender_pathIndices.push(senderPath.pathIndices);

		// Backend trừ tiền và Cập nhật Gốc Tạm (Intermediate Root)
		if (enabled === 1n) {
			let sBal_new = s.balance - amount - fee;
			let sNonce_new = s.nonce + 1n;
			updateTree(s.address, getLeaf(s.x, s.y, sBal_new, sNonce_new));
			s.balance = sBal_new;
			s.nonce = sNonce_new;
		}

		// Trích xuất Merkle Path CŨ của Receiver (Lấy từ Gốc Tạm)
		let receiverPath = getPath(r.address);
		inputJson.receiver_pubKey_x.push(F.toString(r.x));
		inputJson.receiver_pubKey_y.push(F.toString(r.y));
		inputJson.receiver_balances.push(r.balance.toString());
		inputJson.receiver_nonces.push(r.nonce.toString());
		inputJson.receiver_pathElements.push(receiverPath.pathElements);
		inputJson.receiver_pathIndices.push(receiverPath.pathIndices);

		// Backend cộng tiền và Cập nhật Gốc Mới (New Root)
		if (enabled === 1n) {
			let rBal_new = r.balance + amount;
			updateTree(r.address, getLeaf(r.x, r.y, rBal_new, r.nonce));
			r.balance = rBal_new;
			cumulativeFee += fee;
		}

		// Ký giao dịch bằng EdDSA
		const msgHash = poseidon([r.address, F.e(amount), F.e(fee), F.e(old_nonce)]);
		const sig = eddsa.signPoseidon(PRIVATE_KEYS.ALICE, msgHash);

		inputJson.txs_enabled.push(enabled.toString());
		inputJson.txs_from_x.push(F.toString(s.x));
		inputJson.txs_from_y.push(F.toString(s.y));
		inputJson.txs_to_x.push(F.toString(r.x));
		inputJson.txs_to_y.push(F.toString(r.y));
		inputJson.txs_amount.push(amount.toString());
		inputJson.txs_fee.push(fee.toString());
		inputJson.txs_nonce.push(old_nonce.toString());
		inputJson.txs_sig_R8x.push(F.toString(sig.R8[0]));
		inputJson.txs_sig_R8y.push(F.toString(sig.R8[1]));
		inputJson.txs_sig_S.push(sig.S.toString());

		daHashesForTree.push(msgHash);
	}

	console.log(`[Thành công] Đã xử lý xong các giao dịch. Tổng phí thu được: ${cumulativeFee} đơn vị.`);

	// --- 3. Thu phí cho Operator ---
	let opPath = getPath(state.Op.address);
	inputJson.operator_pub_x = F.toString(state.Op.x);
	inputJson.operator_pub_y = F.toString(state.Op.y);
	inputJson.operator_balance_old = state.Op.balance.toString();
	inputJson.operator_nonce = state.Op.nonce.toString();
	inputJson.operator_pathElements = opPath.pathElements;
	inputJson.operator_pathIndices = opPath.pathIndices;

	let opBal_new = state.Op.balance + cumulativeFee;
	updateTree(state.Op.address, getLeaf(state.Op.x, state.Op.y, opBal_new, state.Op.nonce));

	inputJson.newStateRoot = getRoot();

	// --- 4. TÍNH BĂM NHỊ PHÂN CHO DA ROOT ---
	let n_nodes = CONFIG.N_TXS - 1;
	let node_hashes = new Array(2 * CONFIG.N_TXS - 1).fill(0n);

	// Gán lá
	for (let i = 0; i < CONFIG.N_TXS; i++) {
		node_hashes[n_nodes + i] = daHashesForTree[i];
	}

	// Băm ngược lên gốc
	for (let i = n_nodes - 1; i >= 0; i--) {
		node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
	}
	const daTreeRoot = node_hashes[0];

	// --- 5. Tính Public Input Hash ---
	inputJson.publicInputHash = F.toString(
		hashArr([BigInt(inputJson.oldStateRoot), BigInt(inputJson.newStateRoot), daTreeRoot]),
	);

	// --- 6. Xuất File ---
	fs.writeFileSync(PATHS.OUTPUT_INPUT_JSON, JSON.stringify(inputJson, null, 2));
	console.log(`[HOÀN TẤT] File input đã được xuất ra thành công tại:\n -> ${PATHS.OUTPUT_INPUT_JSON}`);
}

main().catch(console.error);
