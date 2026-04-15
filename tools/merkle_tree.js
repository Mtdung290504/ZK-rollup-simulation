import fs from 'fs';
import path from 'path';

// Dense Poseidon Merkle Tree (Depth = 6)
export class DenseMerkleTree {
	constructor(poseidon, depth, zerosCachePath) {
		this.poseidon = poseidon;
		this.F = poseidon.F;
		this.depth = depth;
		this.nodes = {}; // "level,index" => hash (BigInt string)
		this.zeros = this._getZeroHashes(zerosCachePath);
	}

	_getZeroHashes(cachePath) {
		let zeros = [];
		const emptyLeaf = this.poseidon([0n, 0n, 0n, 0n]);

		if (fs.existsSync(cachePath)) {
			try {
				const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
				if (cachedData.length >= this.depth + 1) {
					return cachedData.slice(0, this.depth + 1).map((x) => this.F.e(x));
				}
			} catch (e) {}
		}

		zeros.push(emptyLeaf);
		for (let i = 0; i < this.depth; i++) {
			zeros.push(this.poseidon([zeros[i], zeros[i]]));
		}

		const stringifiedZeros = zeros.map((x) => this.F.toString(x));
		fs.writeFileSync(cachePath, JSON.stringify(stringifiedZeros, null, 2));

		return zeros;
	}

	loadNodes(savedNodes) {
		this.nodes = savedNodes || {};
	}

	exportNodes() {
		return this.nodes;
	}

	getRoot() {
		let root = this.nodes[`${this.depth},0`];
		return root !== undefined ? root : this.F.toString(this.zeros[this.depth]);
	}

	updateLeaf(index, leafValue) {
		let addrBits = BigInt(index).toString(2).padStart(this.depth, '0').split('').reverse().map(Number);
		let currentIndex = BigInt(index);

		let leafStr = this.F.toString(leafValue);
		this.nodes[`0,${currentIndex}`] = leafStr;
		let currentHash = leafValue;

		for (let i = 0; i < this.depth; i++) {
			let isRight = addrBits[i];
			let siblingIndex = isRight ? currentIndex - 1n : currentIndex + 1n;
			let siblingHash = this.nodes[`${i},${siblingIndex}`];

			if (siblingHash === undefined) {
				siblingHash = this.zeros[i];
			} else {
				siblingHash = this.F.e(siblingHash);
			}

			let left = isRight ? siblingHash : currentHash;
			let right = isRight ? currentHash : siblingHash;

			currentHash = this.poseidon([left, right]);
			currentIndex = currentIndex / 2n;
			this.nodes[`${i + 1},${currentIndex}`] = this.F.toString(currentHash);
		}
		return this.F.toString(currentHash);
	}
}
