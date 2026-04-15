import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db', 'l1_db.json');

export function readDB() {
	if (!fs.existsSync(DB_PATH)) {
		throw new Error('L1 DB not initialized. Run init_db.js first.');
	}
	return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

export function writeDB(data) {
	fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}
