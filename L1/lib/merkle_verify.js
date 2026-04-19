import { getPoseidon, poseidonHash, poseidonHashArr } from '../../tools/poseidon.js';

export async function computeLeafHash(txData) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const leafHash = poseidonHashArr(poseidon, [
		BigInt(txData.type),
		BigInt(txData.from_x),
		BigInt(txData.from_y),
		BigInt(txData.to_x),
		BigInt(txData.to_y),
		BigInt(txData.amount),
		BigInt(txData.fee),
		BigInt(txData.nonce),
		BigInt(txData.l1_address || 0),
	]);
	return F.toString(leafHash);
}

export async function verifyMerkleProof(txData, merkleProof, daRoot) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const leafHashStr = await computeLeafHash(txData);
	let currentHash = BigInt(leafHashStr);

	// 2. Validate path elements to compute DA Tree root
	for (let i = 0; i < merkleProof.pathElements.length; i++) {
		const isRight = merkleProof.pathIndices[i] === 1;
		const sibling = BigInt(merkleProof.pathElements[i]);

		let left = isRight ? sibling : currentHash;
		let right = isRight ? currentHash : sibling;

		let rawHash = poseidonHash(poseidon, left, right);
		currentHash = BigInt(F.toString(rawHash));
	}

	const computedRoot = currentHash.toString();
	console.log(`[Merkle Verify] Input Leaf = ${leafHashStr}`);
	console.log(`[Merkle Verify] Computed Root = ${computedRoot}`);
	console.log(`[Merkle Verify] Expected Root (DA Root) = ${daRoot.toString()}`);
	return computedRoot === daRoot.toString();
}

export async function computePublicInputHash(oldStateRoot, newStateRoot, daRoot, operationsHash) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const hash = poseidonHashArr(poseidon, [
		BigInt(oldStateRoot),
		BigInt(newStateRoot),
		BigInt(daRoot),
		BigInt(operationsHash),
	]);

	return F.toString(hash);
}

export async function computeOperationsHash(oldHash, depositId, toX, toY, amount) {
	const poseidon = await getPoseidon();
	const F = poseidon.F;

	const hash = poseidonHashArr(poseidon, [
		BigInt(oldHash),
		BigInt(depositId),
		BigInt(toX),
		BigInt(toY),
		BigInt(amount),
	]);

	return F.toString(hash);
}
