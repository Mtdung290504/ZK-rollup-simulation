import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'L2', 'db', 'l2_db.json');

function formatToHex() {
	if (!fs.existsSync(DB_PATH)) {
		console.error(`L2 DB not found at ${DB_PATH}`);
		process.exit(1);
	}

	const dbStr = fs.readFileSync(DB_PATH, 'utf8');
	const db = JSON.parse(dbStr);

	if (!db.accounts) {
		console.log('No accounts object found in DB.');
		return;
	}

	const newAccounts = {};
	let modifiedCount = 0;

	for (const pubX in db.accounts) {
		const acc = db.accounts[pubX];

		let newPubX = pubX;
		// Check if key is decimal
		if (!pubX.startsWith('0x')) {
			newPubX = '0x' + BigInt(pubX).toString(16);
			modifiedCount++;
		}

		// Check if pub_y is decimal
		if (!acc.pub_y.startsWith('0x')) {
			acc.pub_y = '0x' + BigInt(acc.pub_y).toString(16);
			modifiedCount++;
		}

		newAccounts[newPubX] = acc;
	}

	if (modifiedCount > 0) {
		db.accounts = newAccounts;
		fs.writeFileSync(DB_PATH, JSON.stringify(db, null, '\t'));
		console.log(`Successfully formatted L2 Database. Converted ${modifiedCount} decimal entries to Hex.`);
	} else {
		console.log('No decimal addresses found. All accounts are already in Hex format.');
	}
}

formatToHex();
