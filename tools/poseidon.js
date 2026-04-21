import { buildPoseidon } from 'circomlibjs';

/**
 * @typedef {import('circomlibjs').Poseidon} Poseidon
 * @typedef {import('circomlibjs').BigNumberish} BigNumberish
 */

/**
 * @type {Poseidon?}
 */
let poseidonInstance = null;

export async function getPoseidon() {
	if (!poseidonInstance) poseidonInstance = await buildPoseidon();
	return poseidonInstance;
}

/**
 *
 * @param {Poseidon} poseidon
 * @param {import('circomlibjs').BigNumberish} left
 * @param {import('circomlibjs').BigNumberish} right
 */
export function poseidonHash(poseidon, left, right) {
	return poseidon([left, right]);
}

/**
 * @param {Poseidon} poseidon
 * @param {BigNumberish[]} arr
 */
export function poseidonHashArr(poseidon, arr) {
	return poseidon(arr);
}
