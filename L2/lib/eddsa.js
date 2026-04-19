import { buildEddsa } from 'circomlibjs';

let eddsaInstance = null;

export async function getEddsa() {
	if (!eddsaInstance) {
		eddsaInstance = await buildEddsa();
	}
	return eddsaInstance;
}

export function verifyEdDSASignature(eddsa, F, pubKey, msgHash, sig) {
	// Reconstruct PublicKey
	const pub = [F.e(pubKey.x), F.e(pubKey.y)];

	// Reconstruct Signature
	const signature = {
		R8: [F.e(sig.R8x), F.e(sig.R8y)],
		S: BigInt(sig.S),
	};

	return eddsa.verifyPoseidon(msgHash, signature, pub);
}
