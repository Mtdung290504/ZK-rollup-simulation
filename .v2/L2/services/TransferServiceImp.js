// @ts-check
import { useContext } from '../../.shared/lite_rpc/server.js';
import { readDB, writeDB, addTransaction } from '../db/index.js';
import TransferService from './public/TransferService.js';
import { getPoseidon, poseidonHashArr } from '../../../tools/poseidon.js';
import { getEddsa, verifyEdDSASignature } from '../../../L2/lib/eddsa.js';
import { DenseMerkleTree } from '../../../tools/merkle_tree.js';
import path from 'path';

const cachePath = path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json');

export default class TransferServiceImp extends useContext(TransferService) {
	/**
	 * @type {TransferService['transfer']}
	 */
	async transfer(tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address, sig_R8x, sig_R8y, sig_S) {
		const { res } = this.context;

		if (!from_x || !to_x || !amount || typeof fee === 'undefined' || typeof nonce === 'undefined' || !sig_S) {
			res.status(400);
			return { success: false, error: 'Missing transfer parameters' };
		}

		const type = Number(tx_type || 0);
		const amt = BigInt(amount);
		const f = BigInt(fee);
		const nnc = BigInt(nonce);
		const l1Addr = BigInt(l1_address || '0');

		try {
			const db = readDB();
			const poseidon = await getPoseidon();
			const eddsa = await getEddsa();

			// 1. Find Sender and Receiver
			let sender = null,
				receiver = null,
				treasury = null;

			for (const key in db.accounts) {
				const acc = db.accounts[key];
				if (acc.pub_x === from_x && acc.pub_y === from_y) sender = acc;
				if (acc.pub_x === to_x && acc.pub_y === to_y) receiver = acc;
				if (acc.index === 0) treasury = acc; // Treasury is always at index 0 (assumed rule)
			}

			if (!sender) {
				res.status(400);
				return { success: false, error: 'Sender not found in L2 State' };
			}
			if (!receiver) {
				res.status(400);
				return { success: false, error: 'Receiver not found in L2 State' };
			}
			if (!treasury) {
				res.status(500);
				return { success: false, error: 'System error: Treasury not found' };
			}

			// 2. Validate Nonce
			if (BigInt(sender.nonce) !== nnc) {
				res.status(400);
				return { success: false, error: `Invalid nonce. Expected ${sender.nonce}` };
			}

			// 3. Validate Balance
			if (BigInt(sender.balance) < amt + f) {
				res.status(400);
				return { success: false, error: 'Insufficient L2 balance' };
			}

			// 4. Validate EdDSA Signature
			const msgHash = poseidonHashArr(poseidon, [
				BigInt(type),
				BigInt(from_x),
				BigInt(from_y),
				BigInt(to_x),
				BigInt(to_y),
				amt,
				f,
				nnc,
				l1Addr,
			]);

			const isValidSig = verifyEdDSASignature(eddsa, poseidon.F, { x: from_x, y: from_y }, msgHash, {
				R8x: sig_R8x,
				R8y: sig_R8y,
				S: sig_S,
			});

			if (!isValidSig) {
				res.status(400);
				return { success: false, error: 'Invalid EdDSA Signature' };
			}

			// 5. Update Merkle Tree & State (Soft Finality)
			const tree = new DenseMerkleTree(poseidon, 6, cachePath);
			tree.loadNodes(db.system.merkle_tree.nodes);

			// 5a. Deduct Sender
			sender.balance = (BigInt(sender.balance) - amt - f).toString();
			sender.nonce = (BigInt(sender.nonce) + 1n).toString();
			let leafSender = poseidonHashArr(poseidon, [
				BigInt(sender.pub_x),
				BigInt(sender.pub_y),
				BigInt(sender.balance),
				BigInt(sender.nonce),
			]);
			tree.updateLeaf(sender.index, leafSender);

			// 5b. Credit Receiver
			receiver.balance = (BigInt(receiver.balance) + amt).toString();
			let leafReceiver = poseidonHashArr(poseidon, [
				BigInt(receiver.pub_x),
				BigInt(receiver.pub_y),
				BigInt(receiver.balance),
				BigInt(receiver.nonce),
			]);
			tree.updateLeaf(receiver.index, leafReceiver);

			// 5c. Optional: Attribute Fee to Operator
			let operator = db.accounts['Operator'];
			if (operator) {
				operator.balance = (BigInt(operator.balance) + f).toString();
				let leafOp = poseidonHashArr(poseidon, [
					BigInt(operator.pub_x),
					BigInt(operator.pub_y),
					BigInt(operator.balance),
					BigInt(operator.nonce),
				]);
				tree.updateLeaf(operator.index, leafOp);
			}

			// Save tree state
			db.system.merkle_tree.nodes = tree.exportNodes();

			// 6. Append to Mempool / Transactions
			const tx = {
				type: type,
				from_x,
				from_y,
				to_x,
				to_y,
				amount: amount.toString(),
				fee: fee.toString(),
				nonce: nonce.toString(),
				l1_address: l1_address || '0',
				deposit_id: -1,
				sig_R8x,
				sig_R8y,
				sig_S,
				timestamp: Date.now(),
			};
			addTransaction(db, tx);
			await writeDB();
			console.log(`[L2/Transfer] Accepted Tx! From [${sender.index}] to [${receiver.index}] amount ${amt}`);

			return { success: true, tx };
		} catch (err) {
			console.error('[L2/Transfer] Internal Error:', err);
			res.status(500);
			return { success: false, error: 'Server error' };
		}
	}
}
