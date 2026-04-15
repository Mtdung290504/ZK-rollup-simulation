import { getPoseidon, poseidonHash, poseidonHashArr } from '../../tools/poseidon.js';

export async function verifyMerkleProof(txData, merkleProof, daRoot) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	// 1. Calc leaf = DaHash (Poseidon)
	// payload: [receiverPubKeyHash, amount, fee, nonce]
	const receiverPubKeyHash = poseidonHashArr(poseidon, [BigInt(txData.to_x), BigInt(txData.to_y)]);

	const msgHash = poseidonHashArr(poseidon, [
		receiverPubKeyHash,
		BigInt(txData.amount),
		BigInt(txData.fee),
		BigInt(txData.nonce),
	]);

	// 2. Validate path elements to compute DA Tree root
	let currentHash = msgHash;

	for (let i = 0; i < merkleProof.pathElements.length; i++) {
		const isRight = merkleProof.pathIndices[i] === 1;
		const sibling = BigInt(merkleProof.pathElements[i]);

		let left = isRight ? sibling : currentHash;
		let right = isRight ? currentHash : sibling;

		currentHash = poseidonHash(poseidon, left, right);
	}

	const computedRoot = F.toString(currentHash);
    console.log(`[Merkle Verify] Input Leaf = ${F.toString(msgHash)}`);
    console.log(`[Merkle Verify] Computed Root = ${computedRoot}`);
    console.log(`[Merkle Verify] Expected Root (DA Root) = ${daRoot.toString()}`);
	return computedRoot === daRoot.toString();
}

export async function computePublicInputHash(oldStateRoot, newStateRoot, daRoot) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const hash = poseidonHashArr(poseidon, [BigInt(oldStateRoot), BigInt(newStateRoot), BigInt(daRoot)]);

	return F.toString(hash);
}
