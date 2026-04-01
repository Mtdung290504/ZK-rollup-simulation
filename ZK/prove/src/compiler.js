import fs from 'fs';
import path from 'path';
import { run, quote } from './utils.js';
import { execSync } from 'child_process';

/**
 * Lấy số constraints thực tế từ file .r1cs sau khi compile
 *
 * @param {string} r1csPath - Đường dẫn file .r1cs
 * @returns {number} - Số constraints thực tế
 */
function getActualConstraintCount(r1csPath) {
	try {
		const output = execSync(`npx snarkjs r1cs info ${quote(r1csPath)}`, {
			encoding: 'utf8',
			stdio: 'pipe',
		});
		const constraintMatch = output.match(/# of constraints:\s*(\d+)/i);
		if (constraintMatch) return parseInt(constraintMatch[1]);
		return 0;
	} catch (error) {
		console.log(`> [Warning] Could not get actual constraint count: ${error}`);
		return 0;
	}
}

/**
 * Biên dịch Circom circuit thành các file cần thiết
 *
 * @param {string} circuitDir - Thư mục chứa file .circom
 * @param {string} outputDir - Thư mục output
 * @returns {{ circuitName: string, constraintPower: number, r1csPath: string, wasmPath: string }}
 */
export function compileCircuit(circuitDir, outputDir) {
	console.log('\n--> [Step 1] Compiling Circom circuit...');

	// Mò file index.circom trong dir
	const circomFile = 'index.circom';
	const circomPath = path.resolve(circuitDir, circomFile);

	if (!fs.existsSync(circomPath)) {
		throw new Error(`Circuit file not found: ${circomPath}`);
	}

	// Tên mạch mặc định từ index.circom
	const circuitName = 'index';

	const r1csPath = path.join(outputDir, `${circuitName}.r1cs`);
	const wasmPath = path.join(outputDir, `${circuitName}_js/${circuitName}.wasm`);

	// Kiểm tra xem mạch circom có bị thay đổi (sửa code) hay không
	if (
		fs.existsSync(r1csPath) &&
		fs.existsSync(wasmPath) &&
		fs.statSync(circomPath).mtimeMs <= fs.statSync(r1csPath).mtimeMs
	) {
		console.log('> [Info] Circuit code không thay đổi, bỏ qua bước compile');
	} else {
		console.log('> [Info] Compiling...');
		// Khi mạch đổi, r1cs thay đổi, các khóa cũ sẽ không còn khớp.
		// PHẢI xóa thư mục zkey cũ trong outputDir để bắt buộc việc Setup lại.
		if (fs.existsSync(outputDir)) {
			['plonk', 'groth16'].forEach((scheme) => {
				const schemeDir = path.join(outputDir, scheme);
				if (fs.existsSync(schemeDir)) {
					fs.rmSync(schemeDir, { recursive: true, force: true });
				}
			});
		}

		run(`circom ${quote(circomPath)} --r1cs --wasm --sym -o ${quote(outputDir)}`);
		if (!fs.existsSync(r1csPath) || !fs.existsSync(wasmPath)) {
			throw new Error('Circuit compilation failed - missing output files');
		}

		// Xóa các file JS không còn sử dụng mặc định do Circom sinh ra
		const jsDir = path.join(outputDir, `${circuitName}_js`);
		['generate_witness.js', 'witness_calculator.js'].forEach((f) => {
			const fPath = path.join(jsDir, f);
			if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
		});
	}

	// Tính thông số PTAU từ thực tế
	const actualConstraints = getActualConstraintCount(r1csPath);
	if (actualConstraints === 0) {
		throw new Error('Could not determine constraint count from r1cs');
	}
	console.log(`> [Info] Actual constraints: ${actualConstraints}`);

	// Tính power of 2 phù hợp nhất (Cần nhân 2 vì PLONK gates lớn hơn R1CS)
	// Bắt đầu từ 10 vì nhẹ & cover được hết case cơ bản, tăng dần theo size
	let constraintPower = 10;
	while (1 << constraintPower < actualConstraints * 2 && constraintPower < 28) constraintPower++;
	console.log(`> [Info] Required powers of tau: 2^${constraintPower}`);

	return { circuitName, constraintPower, r1csPath, wasmPath };
}
