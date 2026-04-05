import generateFakeTransaction from './generateFakeTransaction.js';
import { buildPoseidon, buildEddsa } from 'circomlibjs';

async function main() {
	// Generate some private keys for users and operator
	const prkOperator = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex');
	const prkAlice = Buffer.from('0000000000000000000000000000000000000000000000000000000000000002', 'hex');
	const prkBob = Buffer.from('0000000000000000000000000000000000000000000000000000000000000003', 'hex');

	// We will generate 10 transactions.
	const N_TXS = 10;
	const txs = [];

	console.log(`Generating ${N_TXS} fake txs...`);
	for (let i = 0; i < N_TXS; i++) {
		// Alice sends 10 to Bob, fee 1
		const tx = await generateFakeTransaction(
			prkAlice,
			prkBob,
			'10',
			'1',
			i.toString(), // nonce
		);
		txs.push(tx);
	}

	console.log('Successfully generated 10 fake transactions.');
	console.log('Example TX[0]:', JSON.stringify(txs[0], null, 2));

	// Notice: building the full SMT and calculating state roots off-chain
	// requires a full SMT implementation library in JS, which is not included here.
	// This script proves the fake transaction generator logic works.
}

main().catch(console.error);
