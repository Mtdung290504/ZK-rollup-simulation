import fs from 'fs';

const l2DbPath = 'L2/db/l2_db.json';
const archivePath = 'archive/db/batch_1.json'; // or maybe batch_2.json
const archivePath2 = 'archive/db/batch_2.json';

// L1 Address của Alice trong quá trình sinh test
const aliceDecimal = '744870160540397124697358427618629963666992721241';
const aliceHex = '0x82792218873fD8FD3965ff076cF08F364Ac8eD59';

// 1. Patch L2 DB
if (fs.existsSync(l2DbPath)) {
	let db = JSON.parse(fs.readFileSync(l2DbPath, 'utf8'));
	let patched = false;
	for (let tx of db.transactions) {
		if (tx.l1_address === aliceDecimal) {
			tx.l1_address = aliceHex;
			patched = true;
		}
	}
	if (patched) {
		fs.writeFileSync(l2DbPath, JSON.stringify(db, null, 2));
		console.log('Patched l2_db.json');
	}
}

// 2. Patch Archive
[archivePath, archivePath2].forEach((p) => {
	if (fs.existsSync(p)) {
		let txs = JSON.parse(fs.readFileSync(p, 'utf8'));
		let patched = false;
		for (let tx of txs) {
			if (tx.l1_address === aliceDecimal) {
				tx.l1_address = aliceHex;
				patched = true;
			}
		}
		if (patched) {
			fs.writeFileSync(p, JSON.stringify(txs, null, 2));
			console.log('Patched ' + p);
		}
	}
});
