import fs from 'fs';
import path from 'path';
import { run, quote } from './utils.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Download ptau file từ Hermez nếu chưa có
 *
 * @param {number} power - Power of 2
 * @param {string} ptauDir - Thư mục chứa ptau files
 * @returns Đường dẫn file ptau đã download hoặc null
 */
function downloadHermezPtau(power, ptauDir) {
	const ptauFile = path.join(ptauDir, `powersOfTau28_hez_final_${power.toString().padStart(2, '0')}.ptau`);

	if (fs.existsSync(ptauFile)) {
		console.log(`> [Info] Hermez ptau file already exists (2^${power})`);
		return ptauFile;
	}

	console.log(`> [Info] Downloading Hermez ptau file for 2^${power} constraints...`);
	const url = `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_${power.toString().padStart(2, '0')}.ptau`;

	try {
		const downloadCmd =
			process.platform === 'win32'
				? `curl -L "${url}" -o ${quote(ptauFile)}`
				: `wget "${url}" -O ${quote(ptauFile)}`;

		run(downloadCmd);

		if (fs.existsSync(ptauFile)) {
			const fileSize = (fs.statSync(ptauFile).size / (1024 * 1024)).toFixed(2);
			console.log(`> [Success] Downloaded ptau file (${fileSize} MB)`);
			return ptauFile;
		}
		throw new Error('File not found after download');
	} catch (error) {
		console.log(`> [Warning] Failed to download Hermez ptau: ${error}`);
		return null;
	}
}

/**
 * Kiểm tra và chuẩn bị Powers of Tau ceremony
 *
 * @param {number} power - Power of 2 constraint thực tế
 * @throws {Error} - Khi download ptau thất bại
 */
export function ensurePtau(power) {
	console.log(`\n--> [Step 2] Preparing Powers of Tau setup (2^${power})...`);

	const ptauDir = path.join(__dirname, '..', 'powers_of_tau');
	if (!fs.existsSync(ptauDir)) {
		fs.mkdirSync(ptauDir, { recursive: true });
	}

	let ptauFile = downloadHermezPtau(power, ptauDir);
	if (!ptauFile) {
		throw new Error('Failed to download ptau file');
	}

	// Đối với phase 2 chung của snarkjs, nếu là file tải từ Hermez (tên có hez_final)
	// thì nó đã được prepare phase2 rồi. Hàm dùng PLONK và GROTH16 đều dùng được trực tiếp file này.
	return ptauFile;
}
