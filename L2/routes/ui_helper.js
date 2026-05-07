import express from 'express';
import { l2Store } from '../db/index.js';
import { getPoseidon, poseidonHashArr } from '../../tools/poseidon.js';
import { getEddsa, verifyEdDSASignature } from '../lib/eddsa.js';
import { buildBabyjub } from 'circomlibjs';

let babyJub;
buildBabyjub().then((b) => {
	babyJub = b;
});

const router = express.Router();

router.get('/fee', (req, res) => {
	// Future: Fetch dynamic fee from config or state
	res.json({ fee: '1' });
});

// Helper route for frontend UI since we don't have circomlib browser bundle
router.post('/sign-and-transfer', async (req, res) => {
	const { privateKey, tx_type, to_x, to_y, amount, fee, l1_address } = req.body;

	if (!privateKey || !to_x || !to_y || amount === undefined || fee === undefined) {
		return res.status(400).json({ error: 'Missing parameters' });
	}

	if (fee.toString() !== '1') {
		return res.status(400).json({ error: 'Invalid fee amount. Required L2 fee is 1.' });
	}

	if (privateKey.length !== 64) {
		return res
			.status(400)
			.json({ error: 'Invalid EdDSA Private Key length. Must be 64 hex characters (32 bytes).' });
	}

	const isWithdraw = Number(tx_type) === 2;

	if (isWithdraw) {
		if (!l1_address) {
			return res.status(400).json({ error: 'Missing L1 address for withdrawal' });
		}
		const evmRegex = /^0x[0-9a-fA-F]{40}$/;
		if (!evmRegex.test(l1_address)) {
			return res.status(400).json({
				error: 'Invalid L1 Address format. Must be a 160-bit hex string starting with 0x (40 characters). Do not input private keys.',
			});
		}
	}

	if (babyJub) {
		try {
			const x = BigInt(to_x);
			const y = BigInt(to_y);
			const isValid = babyJub.inCurve([babyJub.F.e(x), babyJub.F.e(y)]);
			if (!isValid) {
				return res
					.status(400)
					.json({ error: 'Invalid Receiver Public Key: Point is not on the BabyJubJub curve.' });
			}
		} catch (e) {
			return res.status(400).json({ error: 'Invalid Receiver Public Key format.' });
		}
	}

	try {
		const poseidon = await getPoseidon();
		const eddsa = await getEddsa();

		// 1. Recover sender pubkey from privKey
		const privBuf = Buffer.from(privateKey, 'hex');
		const pub = eddsa.prv2pub(privBuf);
		const from_x = '0x' + BigInt(poseidon.F.toString(pub[0])).toString(16);
		const from_y = '0x' + BigInt(poseidon.F.toString(pub[1])).toString(16);

		const to_x_hex = to_x.startsWith('0x') ? to_x : '0x' + BigInt(to_x).toString(16);
		const to_y_hex = to_y.startsWith('0x') ? to_y : '0x' + BigInt(to_y).toString(16);

		// 2. Lookup sender nonce in DB — accounts keyed by pub_x (O(1))
		const db = l2Store.data;
		const sender = db.accounts[from_x];
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
			BigInt(to_x_hex),
			BigInt(to_y_hex),
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
				to_x: to_x_hex,
				to_y: to_y_hex,
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
