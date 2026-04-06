import { buildPoseidon } from 'circomlibjs';

async function generateZeroHashes() {
	const poseidon = await buildPoseidon();
	const F = poseidon.F;

	console.log('=== COPY ĐOẠN NÀY QUĂNG LẠI CHO TÔI ===');
	console.log('var ZERO[6];');

	// Tầng 0 (Lá rỗng): Chúng ta quy ước mã băm của giao dịch padding là 0 cho nhẹ
	let currentHash = 0n;
	console.log(`ZERO[0] = ${currentHash};`);

	// Tính các tầng tiếp theo của cây nhị phân (Đủ cho cây có tối đa 32 lá)
	for (let i = 1; i <= 5; i++) {
		currentHash = F.toObject(poseidon([currentHash, currentHash]));
		console.log(`ZERO[${i}] = ${currentHash};`);
	}
	console.log('========================================');
}

generateZeroHashes();
