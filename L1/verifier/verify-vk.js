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
		const plonkDir = path.join(circuitDir, 'output/plonk');
		const oldVkPath = path.join(plonkDir, 'verification_key.json');
		const PTAU = path.resolve(process.cwd(), 'ZK/prove/powers_of_tau/powersOfTau28_hez_final_14.ptau');

		await fs.mkdir(tmpDir, { recursive: true });
		const r1cs = path.join(tmpDir, 'index.r1cs');
		const zkey = path.join(tmpDir, 'index.zkey');
		const newVk = path.join(tmpDir, 'vk.json');

		// 1. compile
		await execAsync(`circom "${circom}" --r1cs --wasm -o "${tmpDir}"`);

		// 2. setup
		await execAsync(`snarkjs plonk setup "${r1cs}" "${PTAU}" "${zkey}"`);

		// 3. export vk
		await execAsync(`snarkjs zkey export verificationkey "${zkey}" "${newVk}"`);

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

console.log(await verifyCircuit(path.resolve(process.cwd(), 'ZK/circuits/prove_rollup.lite'), true));
