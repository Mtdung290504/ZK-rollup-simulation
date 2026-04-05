import fs from 'fs';
import path from 'path';
import { buildPoseidon, buildEddsa } from 'circomlibjs';

async function main() {
	const poseidon = await buildPoseidon();
	const eddsa = await buildEddsa();
	const F = poseidon.F;

	const DEPTH = 8;
	const N_TXS = 4;

	function hash(left, right) {
		return poseidon([left, right]);
	}
	function hashArr(inputs) {
		return poseidon(inputs);
	}
	function toBig(val) {
		return BigInt(F.toString(val));
	}
	function getAddress(pubX, pubY) {
		return hashArr([pubX, pubY]);
	}
	function getLeaf(pubX, pubY, balance, nonce) {
		return hashArr([pubX, pubY, F.e(balance), F.e(nonce)]);
	}
	function getIndex(addr) {
		return toBig(addr) & ((1n << BigInt(DEPTH)) - 1n);
	}

	const emptyLeaf = getLeaf(0n, 0n, 0n, 0n);
	const zeros = [emptyLeaf];
	for (let i = 0; i < DEPTH; i++) {
		zeros.push(hash(zeros[i], zeros[i]));
	}

	let treeNodes = {};

	function getPath(addr) {
		let index = getIndex(addr);
		let addrBits = index.toString(2).padStart(DEPTH, '0').split('').reverse().map(Number);
		let pathElements = [];
		let currentIndex = index;

		for (let i = 0; i < DEPTH; i++) {
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
		let addrBits = index.toString(2).padStart(DEPTH, '0').split('').reverse().map(Number);
		let currentIndex = index;

		treeNodes[`0,${currentIndex}`] = leafValue;
		let currentHash = leafValue;

		for (let i = 0; i < DEPTH; i++) {
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

	function getRoot() {
		let root = treeNodes[`${DEPTH},0`];
		return root !== undefined ? F.toString(root) : F.toString(zeros[DEPTH]);
	}

	const prkAlice = Buffer.from('01'.repeat(32), 'hex');
	const prkBob = Buffer.from('02'.repeat(32), 'hex');
	const prkOp = Buffer.from('03'.repeat(32), 'hex');

	const pubA = eddsa.prv2pub(prkAlice);
	const pubB = eddsa.prv2pub(prkBob);
	const pubOp = eddsa.prv2pub(prkOp);

	let state = {
		Alice: { x: pubA[0], y: pubA[1], balance: 10000n, nonce: 0n, address: getAddress(pubA[0], pubA[1]) },
		Bob: { x: pubB[0], y: pubB[1], balance: 5000n, nonce: 0n, address: getAddress(pubB[0], pubB[1]) },
		Op: { x: pubOp[0], y: pubOp[1], balance: 0n, nonce: 0n, address: getAddress(pubOp[0], pubOp[1]) },
	};

	updateTree(state.Alice.address, getLeaf(state.Alice.x, state.Alice.y, state.Alice.balance, state.Alice.nonce));
	updateTree(state.Bob.address, getLeaf(state.Bob.x, state.Bob.y, state.Bob.balance, state.Bob.nonce));
	updateTree(state.Op.address, getLeaf(state.Op.x, state.Op.y, state.Op.balance, state.Op.nonce));

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

	for (let i = 0; i < N_TXS; i++) {
		let isPadding = i >= 2;
		let enabled = isPadding ? 0n : 1n;

		let amount = isPadding ? 0n : 10n;
		let fee = isPadding ? 0n : 1n;

		let s = state.Alice;
		let r = state.Bob;

		// VÁ LỖI TẠI ĐÂY: Lưu lại nonce cũ trước khi nó bị biến đổi
		let old_nonce = s.nonce;

		let senderPath = getPath(s.address);
		inputJson.sender_balances.push(s.balance.toString());
		inputJson.sender_nonces.push(old_nonce.toString());
		inputJson.sender_pathElements.push(senderPath.pathElements);
		inputJson.sender_pathIndices.push(senderPath.pathIndices);

		let sBal_new = s.balance;
		let sNonce_new = s.nonce;
		if (enabled === 1n) {
			sBal_new = s.balance - amount - fee;
			sNonce_new = s.nonce + 1n;
			updateTree(s.address, getLeaf(s.x, s.y, sBal_new, sNonce_new));
		}

		let receiverPath = getPath(r.address);
		inputJson.receiver_pubKey_x.push(F.toString(r.x));
		inputJson.receiver_pubKey_y.push(F.toString(r.y));
		inputJson.receiver_balances.push(r.balance.toString());
		inputJson.receiver_nonces.push(r.nonce.toString());
		inputJson.receiver_pathElements.push(receiverPath.pathElements);
		inputJson.receiver_pathIndices.push(receiverPath.pathIndices);

		if (enabled === 1n) {
			s.balance = sBal_new;
			s.nonce = sNonce_new; // S.NONCE BỊ ĐỔI Ở ĐÂY
			let rBal_new = r.balance + amount;
			updateTree(r.address, getLeaf(r.x, r.y, rBal_new, r.nonce));
			r.balance = rBal_new;
			cumulativeFee += fee;
		}

		// VÁ LỖI TẠI ĐÂY: Ký bằng old_nonce thay vì s.nonce
		const msgHash = poseidon([r.address, F.e(amount), F.e(fee), F.e(old_nonce)]);
		const sig = eddsa.signPoseidon(prkAlice, msgHash);

		inputJson.txs_enabled.push(enabled.toString());
		inputJson.txs_from_x.push(F.toString(s.x));
		inputJson.txs_from_y.push(F.toString(s.y));
		inputJson.txs_to_x.push(F.toString(r.x));
		inputJson.txs_to_y.push(F.toString(r.y));
		inputJson.txs_amount.push(amount.toString());
		inputJson.txs_fee.push(fee.toString());
		inputJson.txs_nonce.push(old_nonce.toString()); // GỬI NONCE CŨ VÀO MẠCH
		inputJson.txs_sig_R8x.push(F.toString(sig.R8[0]));
		inputJson.txs_sig_R8y.push(F.toString(sig.R8[1]));
		inputJson.txs_sig_S.push(sig.S.toString());

		daHashesForTree.push(msgHash);
	}

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

	function nextPowerOf2(n) {
		let count = 0;
		if (n > 0 && (n & (n - 1)) === 0) return n;
		while (n !== 0) {
			n >>= 1;
			count += 1;
		}
		return 1 << count;
	}

	let N_PAD = nextPowerOf2(N_TXS);
	let nodeHashes = [...daHashesForTree];
	for (let i = N_TXS; i < N_PAD; i++) nodeHashes.push(0n);

	let write_idx = N_PAD;
	let read_idx = 0;
	for (let i = 0; i < N_PAD - 1; i++) {
		nodeHashes[write_idx] = hash(nodeHashes[read_idx], nodeHashes[read_idx + 1]);
		read_idx += 2;
		write_idx += 1;
	}
	const daTreeRoot = nodeHashes[2 * N_PAD - 2];

	inputJson.publicInputHash = F.toString(
		hashArr([BigInt(inputJson.oldStateRoot), BigInt(inputJson.newStateRoot), daTreeRoot]),
	);

	// Đổi lại path lưu tùy máy của bạn nhé, tôi giả định lưu ở đây:
	const dest = path.join(process.cwd(), './ZK/circuits/prove_rollup/input.json');
	fs.writeFileSync(dest, JSON.stringify(inputJson, null, 2));
	console.log(`✅ Saved valid SMT input (DEPTH=${DEPTH}, TXS=${N_TXS}) to ${dest}`);
}

main().catch(console.error);
