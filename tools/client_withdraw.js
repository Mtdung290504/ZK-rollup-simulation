/**
 * tools/client_withdraw.js
 *
 * Tool giả lập client (frontend) thực hiện Manual Claim chuẩn Zero-Trust.
 *
 * 1. Nhập batch_id và thông tin người dùng (từ wallets.json)
 * 2. Fetch DA Blobs của batch từ Archive Node
 * 3. Tìm giao dịch Rút tiền của user (tx_type == 2)
 * 4. Tự tính toán lại toàn bộ DA Leaf 9-trường và tạo Merkle Proof
 * 5. Submit Proof lên L1 Server để Claim ETH
 */

import fetch from 'node-fetch';
import { getPoseidon, poseidonHashArr } from './poseidon.js';
import { DenseMerkleTree } from './merkle_tree.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_PATH = path.join(__dirname, '..', 'config', 'wallets.json');

const L1_URL = 'http://localhost:3000';
const ARCHIVE_URL = 'http://localhost:4000';

async function main() {
	const args = process.argv.slice(2);
	if (args.length < 2) {
		console.log('Sử dụng: node client_withdraw.js <batch_id> <user_name>');
		console.log('Ví dụ: node client_withdraw.js 1 alice');
		process.exit(1);
	}

	const batch_id = args[0];
	const userName = args[1].toLowerCase();

	const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
	if (!wallets[userName]) {
		console.error(`[Lỗi] Không tìm thấy user '${userName}' trong config wallets.json`);
		process.exit(1);
	}

	const user = wallets[userName];
	console.log(`\n======================================================`);
	console.log(`[Client/Withdraw] Bắt đầu quá trình rút tiền cho ${user.name}`);
	console.log(`[Client/Withdraw] Batch ID: ${batch_id}`);
	console.log(`======================================================\n`);

	// 1. Fetch Blobs từ Archive Node
	console.log(`[1/4] Đang lấy DA Blobs từ Archive Node...`);
	let blobsRes;
	try {
		blobsRes = await fetch(`${ARCHIVE_URL}/archive/blobs/${batch_id}`);
	} catch (e) {
		console.error(`[Lỗi] Không thể kết nối tới Archive Node:`, e.message);
		process.exit(1);
	}

	if (!blobsRes.ok) {
		const err = await blobsRes.json();
		console.error(`[Lỗi] Archive Node trả về lỗi:`, err.error);
		process.exit(1);
	}

	const { transactions } = await blobsRes.json();
	console.log(`      -> Lấy thành công ${transactions.length} giao dịch.`);

	// 2. Tìm Giao dịch Rút tiền của User
	console.log(`[2/4] Quét mảng giao dịch kiếm lệnh Rút tiền (tx_type=2)...`);
	const userPubKeyX = user.l2.publicKey.x;

	let targetTx = null;
	let targetIndex = -1;

	for (let i = 0; i < transactions.length; i++) {
		const tx = transactions[i];
		if (Number(tx.type) === 2 && tx.from_x === userPubKeyX) {
			targetTx = tx;
			targetIndex = i;
			break;
		}
	}

	if (!targetTx) {
		console.error(`[Lỗi] Không tìm thấy giao dịch rút tiền nào của ${user.name} trong Lô #${batch_id}`);
		process.exit(1);
	}

	console.log(`      -> Đã khóa mục tiêu! Giao dịch #${targetIndex} - Số lượng: ${targetTx.amount} ETH.`);

	// 3. Rebuild Merkle Tree và tạo Proof
	console.log(`[3/4] Client giả lập tái tạo Cây DA Merkle 9-field nội bộ...`);
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const CONFIG_N_TXS = 4; // Đồng bộ N_TXS=4 theo mạch ZK
	let leaves = [];
	let targetLeafIndex = -1;

	// Hàm băm 9 trường
	const computeLeaf = (tx) => {
		const type = BigInt(tx.type);
		const l1Addr = BigInt(tx.l1_address || 0);
		return poseidon([
			type,
			BigInt(tx.from_x),
			BigInt(tx.from_y),
			BigInt(tx.to_x),
			BigInt(tx.to_y),
			BigInt(tx.amount),
			BigInt(tx.fee),
			BigInt(tx.nonce),
			l1Addr,
		]);
	};

	let n_txs = CONFIG_N_TXS;
	let node_hashes = new Array(2 * n_txs - 1).fill(0n);
	let n_nodes = n_txs - 1;

	// Điền Hash vào mảng đáy
	for (let i = 0; i < n_txs; i++) {
		let tx = transactions[i];
		if (!tx) {
			tx = { 
				type: 0, 
				from_x: wallets.treasury.l2.publicKey.x, 
				from_y: wallets.treasury.l2.publicKey.y, 
				to_x: '0', to_y: '0', amount: '0', fee: '0', nonce: '0', l1_address: '0' 
			};
		}
		node_hashes[n_nodes + i] = computeLeaf(tx);
	}

	// Cuộn lên Root
	for (let i = n_nodes - 1; i >= 0; i--) {
		node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
	}

	const daRoot = F.toString(node_hashes[0]);
	console.log(`      -> Rebuild DA Root thành công: ${daRoot.slice(0, 16)}...`);

	// Trích xuất path (sibling)
	// index của ta là targetIndex. Gắn với node_hashes thì là (n_nodes + targetIndex)
	let sibling_hashes = [];
	let pathElements = [];
	let pathIndices = [];

	// Mảng hash nhị phân:
	// root = 0. Con trái = 2i+1, Con phải = 2i+2
	// Parent = Math.floor((i-1)/2)
	let currentIndex = n_nodes + targetIndex;

	// Vòng lặp cho tới khi lên gốc
	while (currentIndex > 0) {
		let isRightChild = currentIndex % 2 === 0;
		let sibling = isRightChild ? currentIndex - 1 : currentIndex + 1;

		pathElements.push(F.toString(node_hashes[sibling]));
		pathIndices.push(isRightChild ? 1 : 0); // 1 = Node hiện tại nằm bên phải (Sibling nằm bên trái)

		currentIndex = Math.floor((currentIndex - 1) / 2);
	}

	const merkle_proof = {
		pathElements,
		pathIndices,
	};

	console.log(`      -> Merkle Path được ghép xong. Sẵn sàng bắn tín hiệu!`);

	// 4. Gọi L1 Smart Contract
	console.log(`[4/4] Bắn tín hiệu Claim lên Smart Contract L1...`);
	const payload = {
		l1_address: user.l1.address,
		amount: targetTx.amount,
		batch_id,
		tx_data: {
			tx_type: targetTx.type,
			from_x: targetTx.from_x,
			from_y: targetTx.from_y,
			to_x: targetTx.to_x,
			to_y: targetTx.to_y,
			amount: targetTx.amount,
			fee: targetTx.fee,
			nonce: targetTx.nonce,
			l1_address: targetTx.l1_address,
		},
		merkle_proof,
	};

	try {
		const response = await fetch(`${L1_URL}/contract/withdraw`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		const data = await response.json();
		if (response.ok) {
			console.log(`\n[THÀNH CÔNG] Đã rút thành công ${data.amount_claimed} ETH về ví L1 của ${user.name}!`);
		} else {
			console.error(`\n[THẤT BẠI] Smart Contract L1 từ chối giao dịch:`, data.error);
		}
	} catch (e) {
		console.error(`\n[Lỗi] L1 Server không phản hồi:`, e.message);
	}
}

main().catch(console.error);
