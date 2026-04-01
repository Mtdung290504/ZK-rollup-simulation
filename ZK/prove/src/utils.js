import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Thư mục gốc của project (process.cwd())
export const PROJECT_ROOT = process.cwd();

export const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

/**
 * Resolve đường dẫn từ process.cwd() hoặc absolute path
 * @param {string} inputPath - Đường dẫn input từ user
 * @returns {string} - Absolute path đã được resolve
 */
export function resolveCircuitPath(inputPath) {
	if (path.isAbsolute(inputPath)) return inputPath;
	return path.resolve(PROJECT_ROOT, inputPath);
}

/**
 * Thêm dấu ngoặc kép cho đường dẫn để tránh lỗi với space trong tên file/folder
 * @param {string} p - Đường dẫn cần quote
 * @returns {string} - Đường dẫn đã được quote
 */
export function quote(p) {
	return `"${p}"`;
}

/**
 * Thực thi command line và hiển thị output
 * @param {string} cmd - Command cần thực thi
 * @param {string} workingDir - Thư mục làm việc (default: PROJECT_ROOT)
 */
export function run(cmd, workingDir = PROJECT_ROOT) {
	console.log(`${colors.yellow}> [Execute] ${colors.cyan}${cmd}${colors.reset}`);
	console.log(`${colors.gray}  - At directory: ${workingDir}${colors.reset}`);
	try {
		execSync(cmd, { stdio: 'inherit', cwd: workingDir });
	} catch (error) {
		console.error(`${colors.red}> [Error] Command failed: ${cmd}${colors.reset}`);
		throw error;
	}
}

/**
 * Validate input file format
 * @param {string} inputFile - Đường dẫn file input.json
 */
export function validateInput(inputFile) {
	console.log('> [System] Validating input file...');
	if (!fs.existsSync(inputFile)) {
		throw new Error(`Input file not found: ${inputFile}`);
	}
	try {
		const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
		console.log(`> [System] Input signals: ${Object.keys(inputData).join(', ')}`);
		return inputData;
	} catch (error) {
		throw new Error(`Invalid input JSON format: ${error}`);
	}
}

/**
 * In thông tin debug file
 *
 * @param {string} outputDir
 * @param {{ path: string, name: string }[]} [targetFiles=[]]
 */
export function printDebugInfo(outputDir, targetFiles = []) {
	console.log('\n> [Debug] ===== FILE STATUS =====');
	console.log(`> [Debug] Output directory: ${outputDir}`);

	for (const { path: filePath, name } of targetFiles) {
		const exists = fs.existsSync(filePath);
		console.log(`> [Debug] ${name} exists: ${exists}`);

		if (exists) {
			const size = fs.statSync(filePath).size;
			console.log(`> [Debug] ${name} file size: ${size} bytes`);

			if (filePath.endsWith('.json')) {
				try {
					const content = fs.readFileSync(filePath, 'utf8');
					JSON.parse(content);
					console.log(`> [Debug] ${name} JSON format: Valid`);

					if (name === 'Public inputs') {
						console.log(`> [Debug] Public inputs content: ${content.trim()}`);
					}
				} catch {
					console.log(`> [Error] ${name} JSON format: Invalid`);
				}
			}
		}
	}
	console.log('> [Debug] ===============================\n');
}
