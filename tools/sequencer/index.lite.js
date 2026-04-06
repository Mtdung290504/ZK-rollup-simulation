import fs from 'fs';
import path from 'path';

async function main() {
	const N_TXS = 100;

	const inputJson = {
		txs_from: [],
		txs_to: [],
		txs_amount: [],
		txs_fee: [],
		sender_balances_before: [],
		operator_balance_before: '5000', // Ví Sequencer ban đầu có 5000
	};

	let expectedTotalVolume = 0n;
	let expectedTotalFee = 0n;

	for (let i = 0; i < N_TXS; i++) {
		// Tạo địa chỉ ví fake (Ví dụ: 0x100... 0x200...)
		const from = BigInt(1000 + i);
		const to = BigInt(2000 + i);
		const amount = BigInt(Math.floor(Math.random() * 100) + 1);
		const fee = 2n;
		const balanceBefore = amount + fee + BigInt(Math.floor(Math.random() * 50));

		inputJson.txs_from.push(from.toString());
		inputJson.txs_to.push(to.toString());
		inputJson.txs_amount.push(amount.toString());
		inputJson.txs_fee.push(fee.toString());
		inputJson.sender_balances_before.push(balanceBefore.toString());

		expectedTotalVolume += amount;
		expectedTotalFee += fee;
	}

	const dest = path.join(process.cwd(), 'ZK/circuits/prove_rollup.lite/input.json');
	fs.writeFileSync(dest, JSON.stringify(inputJson, null, 2));

	console.log(`--- LITE SEQUENCER REPORT ---`);
	console.log(`Batch Size: ${N_TXS} Transactions`);
	console.log(`Total Volume: ${expectedTotalVolume} tokens`);
	console.log(`Total Fees for Operator: ${expectedTotalFee} tokens`);
	console.log(`Operator New Balance: ${5000n + expectedTotalFee} tokens`);
}

main().catch(console.error);
