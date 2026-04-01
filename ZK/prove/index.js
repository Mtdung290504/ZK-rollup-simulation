import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCircuitPath, colors } from './src/utils.js';
import { compileCircuit } from './src/compiler.js';
import { ensurePtau } from './src/ptau.js';
import { usePlonk } from './src/schemes/plonk.js';
import { useGroth16 } from './src/schemes/groth16.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Hàm chính định tuyến ZK-SNARK pipeline
 *
 * @param {string} inputCircuitDir - Thư mục circuit từ CLI
 * @param {'plonk' | 'groth16'} protocol - 'plonk' (mặc định) hoặc 'groth16'
 */
export default function generateProof(inputCircuitDir, protocol = 'plonk') {
	const startTime = Date.now();
	try {
		// 1. Resolve và chuẩn bị thư mục
		const circuitDir = resolveCircuitPath(inputCircuitDir);
		console.log(`> [System] Circuit directory: ${circuitDir}`);

		if (!fs.existsSync(circuitDir)) {
			throw new Error(`Circuit directory not found: ${circuitDir}`);
		}

		const outputDir = path.join(circuitDir, 'output');
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}
		// Lưu ý: Không tự ý xoá outputDir (hoặc file zkey) để giữ Phase 2 cache.
		console.log(`> [System] Output directory: ${outputDir}`);

		// 2. Compile mạch Circom và lấy số constraint chính xác
		const { circuitName, constraintPower, r1csPath, wasmPath } = compileCircuit(circuitDir, outputDir);

		// 3. Download / Prepare Common Reference String (Powers of Tau) theo constraint thực tế
		const ptauFile = ensurePtau(constraintPower);

		// 4. Phân luồng Protocol Setup & Prove
		if (protocol === 'plonk') {
			usePlonk(circuitDir, outputDir, circuitName, r1csPath, wasmPath, ptauFile);
		} else if (protocol === 'groth16') {
			useGroth16(circuitDir, outputDir, circuitName, r1csPath, wasmPath, ptauFile);
		} else {
			throw new Error(`Mismatched protocol: ${protocol}. Select 'plonk' or 'groth16'.`);
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(2);
		console.log(`\n${colors.green}> [SUCCESSFULLY]${colors.reset}`);
		console.log(`  - Protocol: ${protocol.toUpperCase()}`);
		console.log(`  - Duration: ${duration}s`);
		console.log(`  - Output tại ${circuitDir}:`);
		console.log(`    + ${protocol}/proof.json`);
		console.log(`    + ${protocol}/public.json`);
		console.log(`    + ${protocol}/verification_key.json`);

		return true;
	} catch (err) {
		console.error(`\n${colors.red}> FAILED${colors.reset}`);
		console.error(`${colors.red}> Error: ${err}${colors.reset}`);
		return false;
	}
}

const isCLI =
	process.argv[1] &&
	(path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase() ||
		path.resolve(process.argv[1]).toLowerCase() === path.dirname(__filename).toLowerCase());

if (isCLI) {
	const inputPath = process.argv[2];
	const protocolArg = process.argv[3] || 'plonk';

	if (!inputPath) {
		console.error('> [Usage Error] Vui lòng cung cấp circuit directory path');
		console.error('> [Example] node ./index.js ./circuits/zkm plonk');
		console.error('> [Example] node ./index.js ./circuits/zkm groth16');
		process.exit(1);
	}

	// @ts-ignore: Not important
	const success = generateProof(inputPath, protocolArg.toLowerCase());
	process.exit(success ? 0 : 1);
}
