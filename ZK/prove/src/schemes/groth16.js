import fs from 'fs';
import path from 'path';
import { run, quote, validateInput, printDebugInfo } from '../utils.js';

/**
 * Sử dụng Groth16 Proving System để tạo bằng chứng
 *
 * @param {string} circuitDir
 * @param {string} outputDir
 * @param {string} circuitName
 * @param {string} r1csPath
 * @param {string} wasmPath
 * @param {string} ptauFile
 */
export function useGroth16(circuitDir, outputDir, circuitName, r1csPath, wasmPath, ptauFile) {
	console.log('\n--> [Step 3 - GROTH16] Setting up Groth16 proving system...');

	const schemeDir = path.join(outputDir, 'groth16');
	if (!fs.existsSync(schemeDir)) fs.mkdirSync(schemeDir, { recursive: true });

	const zkey0 = path.join(schemeDir, `${circuitName}_0000.zkey`);
	const zkeyFinal = path.join(schemeDir, `${circuitName}_final.zkey`);
	const vkey = path.join(schemeDir, `verification_key.json`);
	const witness = path.join(outputDir, `witness.wtns`);
	const proof = path.join(schemeDir, `proof.json`);
	const pub = path.join(schemeDir, `public.json`);
	const inputFile = path.resolve(circuitDir, 'input.json');
	validateInput(inputFile);

	// Kiểm tra Groth16 phase 2 (zkey) đã tồn tại chưa
	// Nếu tạo rồi thì không tạo lại zkey, tiết kiệm thời gian chạy
	if (fs.existsSync(zkeyFinal) && fs.existsSync(vkey)) {
		console.log('> [Info] Groth16 Phase 2 (zkey) đã được tạo, bỏ qua bước setup');
	} else {
		console.log('\n> [Groth16] Setup Phase 2: Generating circuit-specific keys (zkey)');
		run(`npx snarkjs groth16 setup ${quote(r1csPath)} ${quote(ptauFile)} ${quote(zkey0)}`);

		console.log('\n> [Groth16] Contributing entropy to zkey');
		run(`npx snarkjs zkey contribute ${quote(zkey0)} ${quote(zkeyFinal)} --name="MTD22NS" --entropy="29054" -v`);

		console.log('\n> [Groth16] Exporting verification key');
		run(`npx snarkjs zkey export verificationkey ${quote(zkeyFinal)} ${quote(vkey)}`);
	}

	console.log('\n> [Groth16] Generating witness (Calculating signal execution)');
	run(`npx snarkjs wtns calculate ${quote(wasmPath)} ${quote(inputFile)} ${quote(witness)}`);

	console.log('\n> [Groth16] Generating proof');
	run(`npx snarkjs groth16 prove ${quote(zkeyFinal)} ${quote(witness)} ${quote(proof)} ${quote(pub)}`);

	// printDebugInfo(schemeDir, [
	// 	{ path: proof, name: 'Proof' },
	// 	{ path: vkey, name: 'Verification key' },
	// 	{ path: pub, name: 'Public inputs' },
	// ]);

	console.log('\n> [Groth16] Cleaning up intermediate files...');
	[zkey0, witness].forEach((file) => {
		if (fs.existsSync(file)) {
			fs.unlinkSync(file);
			console.log(`  - Deleted: ${path.basename(file)}`);
		}
	});
}
