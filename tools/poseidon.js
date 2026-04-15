import { buildPoseidon } from 'circomlibjs';

let poseidonInstance = null;

export async function getPoseidon() {
	if (!poseidonInstance) {
		poseidonInstance = await buildPoseidon();
	}
	return poseidonInstance;
}

export function poseidonHash(poseidon, left, right) {
	return poseidon([left, right]);
}

export function poseidonHashArr(poseidon, arr) {
	return poseidon(arr);
}
