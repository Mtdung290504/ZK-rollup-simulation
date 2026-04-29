import express from 'express';
import { l2Store } from '../db/index.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { getEddsa, verifyEdDSASignature } from '../lib/eddsa.js';
import { DenseMerkleTree } from '../../tools/merkle_tree.js';
import path from 'path';
import fs from 'fs';

const cachePath = path.join(process.cwd(), 'ZK', 'circuits', 'zero_hashes_cache.json');
const WALLETS_PATH = path.join(process.cwd(), 'config', 'wallets.json');

const router = express.Router();

router.post('/transfer', async (req, res) => {
	const { tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address, sig_R8x, sig_R8y, sig_S } = req.body;

	if (!from_x || !to_x || !amount || typeof fee === 'undefined' || typeof nonce === 'undefined' || !sig_S) {
		return res.status(400).json({ error: 'Missing transfer parameters' });
	}

	const type = Number(tx_type || 0);
	const amt = BigInt(amount);
	const f = BigInt(fee);
	const nnc = BigInt(nonce);
	const l1Addr = BigInt(l1_address || '0');

	try {
		const db = l2Store.data;
		const poseidon = await getPoseidon();
		const eddsa = await getEddsa();
		const wallets = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf8'));
		const TREASURY_PUB_X = wallets.treasury.l2.publicKey.x;
		const OPERATOR_PUB_X = wallets.operator.l2.publicKey.x;

		/**
		 * Hash lá Merkle từ pub_x (key) và data
		 * @param {string} pub_x
		 * @param {{ pub_y: string, balance: string, nonce: string }} acc
		 */
		const hashLeaf = (pub_x, acc) =>
			poseidonHashArr(poseidon, [BigInt(pub_x), BigInt(acc.pub_y), BigInt(acc.balance), BigInt(acc.nonce)]);

		// 1. O(1) lookup bằng pub_x key
		const sender = db.accounts[from_x];
		const receiver = db.accounts[to_x];
		const treasury = db.accounts[TREASURY_PUB_X];

		if (!sender) return res.status(400).json({ error: 'Sender not found in L2 State' });
		if (!receiver) return res.status(400).json({ error: 'Receiver not found in L2 State' });
		if (!treasury) return res.status(500).json({ error: 'System error: Treasury not found' });

		// 2. Validate Nonce
		if (BigInt(sender.nonce) !== nnc) {
			return res.status(400).json({ error: `Invalid nonce. Expected ${sender.nonce}` });
		}

		// 3. Validate Balance
		if (BigInt(sender.balance) < amt + f) {
			return res.status(400).json({ error: 'Insufficient L2 balance' });
		}

		// 4. Validate EdDSA Signature
		// payload: Hash(tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address)
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
			return res.status(400).json({ error: 'Invalid EdDSA Signature' });
		}

		// 5. Update Merkle Tree & State (Soft Finality)
		const tree = new DenseMerkleTree(poseidon, 4, cachePath);
		tree.loadNodes(db.system.merkle_tree.nodes);

		// 5a. Deduct Sender
		sender.balance = (BigInt(sender.balance) - amt - f).toString();
		sender.nonce = (BigInt(sender.nonce) + 1n).toString();
		tree.updateLeaf(sender.index, hashLeaf(from_x, sender));

		// 5b. Credit Receiver
		receiver.balance = (BigInt(receiver.balance) + amt).toString();
		tree.updateLeaf(receiver.index, hashLeaf(to_x, receiver));

		// 5c. Optional: Attribute Fee to Operator
		// According to mock it collects dynamically locally. We can leave fee accumulation to batch builder or apply directly to Operator.
		// For simplicity we let Batch Prover handle it as defined in Sequencer script.
		// However, for consistency of L2 state query we should update Treasury or Operator here.
		// Assuming Operator index = 3, we update Operator balance
		// 5c. Fee goes to Operator
		const operator = db.accounts[OPERATOR_PUB_X];
		if (operator && f > 0n) {
			operator.balance = (BigInt(operator.balance) + f).toString();
			tree.updateLeaf(operator.index, hashLeaf(OPERATOR_PUB_X, operator));
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
		db.transactions.push(tx);

		await l2Store.write();

		console.log(`[L2/Transfer] Accepted Tx! From [${sender.index}] to [${receiver.index}] amount ${amt}`);

		return res.status(200).json({ success: true, tx });
	} catch (err) {
		console.error('[L2/Transfer] Internal Error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

export default router;
