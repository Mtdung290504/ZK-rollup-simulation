import fs from 'fs';
import path from 'path';
import { run, quote, validateInput, printDebugInfo } from '../utils.js';

/**
 * Sử dụng PLONK Proving System để tạo bằng chứng
 *
 * @param {string} circuitDir
 * @param {string} outputDir
 * @param {string} circuitName
 * @param {string} r1csPath
 * @param {string} wasmPath
 * @param {string} ptauFile
 */
export function usePlonk(circuitDir, outputDir, circuitName, r1csPath, wasmPath, ptauFile) {
	console.log('\n--> [Step 3 - PLONK] Setting up PLONK proving system...');

	const schemeDir = path.join(outputDir, 'plonk');
	if (!fs.existsSync(schemeDir)) fs.mkdirSync(schemeDir, { recursive: true });

	const zkeyFinal = path.join(schemeDir, `${circuitName}_final.zkey`);
	const vkey = path.join(schemeDir, `verification_key.json`);
	const witness = path.join(outputDir, `witness.wtns`);
	const proof = path.join(schemeDir, `proof.json`);
	const pub = path.join(schemeDir, `public.json`);
	const inputFile = path.resolve(circuitDir, 'input.json');
	validateInput(inputFile);

	// PLONK sử dụng universal setup, do đó không cần circuit-specific phase 2 contribution.
	// Tuy nhiên nó vẫn tạo file zkey tổng hợp r1cs và ptau. Nếu zkey đã có, skip luôn.
	if (fs.existsSync(zkeyFinal) && fs.existsSync(vkey)) {
		console.log('> [Info] PLONK keys (zkey) đã được thiết lập, bỏ qua bước setup');
	} else {
		console.log('\n> [PLONK] Setup: Generating circuit zkey from universal setup');
		run(`npx snarkjs plonk setup ${quote(r1csPath)} ${quote(ptauFile)} ${quote(zkeyFinal)}`);

		console.log('\n> [PLONK] Exporting verification key');
		run(`npx snarkjs zkey export verificationkey ${quote(zkeyFinal)} ${quote(vkey)}`);
	}

	console.log('\n> [PLONK] Generating witness (Calculating signal execution)');
	run(`npx snarkjs wtns calculate ${quote(wasmPath)} ${quote(inputFile)} ${quote(witness)}`);

	console.log('\n> [PLONK] Generating proof');
	run(`npx snarkjs plonk prove ${quote(zkeyFinal)} ${quote(witness)} ${quote(proof)} ${quote(pub)}`);

	// printDebugInfo(schemeDir, [
	// 	{ path: proof, name: 'Proof' },
	// 	{ path: vkey, name: 'Verification key' },
	// 	{ path: pub, name: 'Public inputs' },
	// ]);

	console.log('\n> [PLONK] Cleaning up intermediate files...');
	if (fs.existsSync(witness)) {
		fs.unlinkSync(witness);
		console.log(`  - Deleted: ${path.basename(witness)}`);
	}
}
