import express from 'express';
import { readDB } from '../lib/db.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { getEddsa, verifyEdDSASignature } from '../lib/eddsa.js';

const router = express.Router();

// Helper route for frontend UI since we don't have circomlib browser bundle
router.post('/sign-and-transfer', async (req, res) => {
	const { privateKey, tx_type, to_x, to_y, amount, fee, l1_address } = req.body;

	if (!privateKey || !to_x || !amount || !fee) {
		return res.status(400).json({ error: 'Missing parameters' });
	}

	try {
		const poseidon = await getPoseidon();
		const eddsa = await getEddsa();

		// 1. Recover sender pubkey from privKey
		const privBuf = Buffer.from(privateKey, 'hex');
		const pub = eddsa.prv2pub(privBuf);
		const from_x = poseidon.F.toString(pub[0]);
		const from_y = poseidon.F.toString(pub[1]);

		// 2. Lookup sender nonce in DB
		const db = readDB();
		let sender = Object.values(db.accounts).find((a) => a.pub_x === from_x && a.pub_y === from_y);

		if (!sender) return res.status(400).json({ error: 'Sender not found in L2 State' });

		const nonce = sender.nonce;
		const type = Number(tx_type || 0);
		const l1Addr = BigInt(l1_address || '0');
		const amt = BigInt(amount);
		const f = BigInt(fee);
		const nnc = BigInt(nonce);

		// 3. Create Signature
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
		const sig = eddsa.signPoseidon(privBuf, msgHash);

		const sig_R8x = poseidon.F.toString(sig.R8[0]);
		const sig_R8y = poseidon.F.toString(sig.R8[1]);
		const sig_S = sig.S.toString();

		// 4. Forward to normal transfer
		const result = await fetch('http://localhost:5000/l2/transfer', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tx_type: type,
				from_x,
				from_y,
				to_x,
				to_y,
				amount,
				fee,
				nonce,
				l1_address: l1_address || '0',
				sig_R8x,
				sig_R8y,
				sig_S,
			}),
		});

		const data = await result.json();
		return res.status(result.status).json(data);
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: 'Failed to sign and transfer' });
	}
});

export default router;
