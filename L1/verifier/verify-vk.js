import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';

const execAsync = util.promisify(exec);

/**
 * @param {object} obj
 */
function hash(obj) {
	return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/**
 * Verify VK có đúng từ circuit không
 *
 * @param {string} circuitDir
 * @param {boolean} [keepTemps=false]
 */
export async function verifyCircuit(circuitDir, keepTemps = false) {
	const tmpDir = path.join(process.cwd(), 'L1/verifier/__tmp__');

	try {
		const circom = path.join(circuitDir, 'index.circom');
		// Lấy trực tiếp File VK đã được deploy lên thư mục L1 để rà soát thay vì file rác trong mục proof
		const oldVkPath = path.resolve(process.cwd(), 'L1/verification_key.json');

		await fs.mkdir(tmpDir, { recursive: true });
		const r1cs = path.join(tmpDir, 'index.r1cs');
		const zkey = path.join(tmpDir, 'index.zkey');
		const newVk = path.join(tmpDir, 'vk.json');

		const cacheExists = await fs
			.access(newVk)
			.then(() => true)
			.catch(() => false);

		if (!cacheExists) {
			console.log('\n[Verify-VK] Không tìm thấy Cache. Compile & Setup...');

			console.log(`[Step 1/3] Biên dịch Mạch...`);
			console.time('Step 1');
			await execAsync(`circom "${circom}" --r1cs -o "${tmpDir}"`);
			console.timeEnd('Step 1');

			// Làm xong mạch L2 công bố file ptau được sử dụng
			const ptauOrder = 18;
			const ptauDir = path.resolve(process.cwd(), 'ZK/prove/powers_of_tau');
			const PTAU = path.join(ptauDir, 'powersOfTau28_hez_final_18.ptau');

			console.log(`[Step 2/3] Setup ZKey (PTAU order: ${ptauOrder})...`);
			console.time('Step 2');
			await execAsync(`snarkjs plonk setup "${r1cs}" "${PTAU}" "${zkey}"`);
			console.timeEnd('Step 2');

			console.log(`[Step 3/3] Exporting Verification Key...`);
			console.time('Step 3');
			await execAsync(`snarkjs zkey export verificationkey "${zkey}" "${newVk}"`);
			console.timeEnd('Step 3');
		} else {
			console.log('[Verify-VK] Tìm thấy Cache! Bỏ qua bước Compile & Setup.');
		}

		// 4. đọc và hash
		const [oldRaw, newRaw] = await Promise.all([fs.readFile(oldVkPath, 'utf-8'), fs.readFile(newVk, 'utf-8')]);

		const oldVk = JSON.parse(oldRaw);
		const newVkObj = JSON.parse(newRaw);

		const same = hash(oldVk) === hash(newVkObj);

		return same;
	} catch (err) {
		console.error('Verify circuit error:', err);
		return false;
	} finally {
		// cleanup
		!keepTemps && (await fs.rm(tmpDir, { recursive: true, force: true }));
	}
}

// Hỗ trợ truyền Argument từ Terminal thay vì hardcode
const args = process.argv.slice(2);
if (args.length > 0) {
	const targetCircuit = path.resolve(process.cwd(), args[0]);
	console.log(`\n[Verify-VK] Đang đối soát Mạch ZK: ${targetCircuit}`);
	console.log(`[Verify-VK] Verify với VK File gốc tại L1/verification_key.json\n`);

	const isSame = await verifyCircuit(targetCircuit, true);
	console.log(`\n[Result]`, isSame);
	if (!isSame) {
		console.log(`Nếu vừa sửa mạch, hãy nhớ Update file L1/verification_key.json của Smart Contract.`);
		console.log(`Nếu nghi ngờ tool check sai (lênh cache), hãy Xóa thư mục L1/verifier/__tmp__ và chạy lại!`);
	}
}
