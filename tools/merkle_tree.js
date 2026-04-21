import fs from 'fs';

export class DenseMerkleTree {
	/**
	 * @param {import('./poseidon').Poseidon} poseidon
	 * @param {number} depth
	 * @param {string} zerosCachePath
	 */
	constructor(poseidon, depth, zerosCachePath) {
		this.poseidon = poseidon;
		this.F = poseidon.F;
		this.depth = depth;
		this.nodes = {}; // "level,index" => hash (BigInt string)
		this.zeros = this._getZeroHashes(zerosCachePath);
	}

	/**
	 * Tính toán hoặc load từ file các giá trị hash của node rỗng ở từng tầng
	 *
	 * @private
	 * @param {string} cachePath
	 * @returns Mảng các hash rỗng từ tầng 0 đến tầng depth
	 */
	_getZeroHashes(cachePath) {
		// Leaf rỗng mặc định là hash của: x=0, y=0, nonce=0, balance=0
		const emptyLeaf = this.poseidon([0n, 0n, 0n, 0n]);
		let zeros = [];

		if (fs.existsSync(cachePath)) {
			try {
				const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
				if (cachedData.length >= this.depth + 1) {
					/**
					 * Dùng hàm ép type của thư viện (F.e) để đảm bảo đúng format do lưu vào file dạng string
					 * @type {import('circomlibjs').BigNumberish[]}
					 */
					const result = cachedData.slice(0, this.depth + 1).map((x) => this.F.e(x)); //
					return result;
				}
			} catch (e) {}
		}

		// Quy tắc: Zero[i+1] = Hash(Zero[i], Zero[i])
		zeros.push(emptyLeaf);
		for (let i = 0; i < this.depth; i++) {
			zeros.push(this.poseidon([zeros[i], zeros[i]]));
		}

		// Cache để dùng lại vì Poseidon chạy nặng
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

	/**
	 * Lấy Root hiện tại của cây
	 * @returns Root hash dưới dạng String
	 */
	getRoot() {
		let root = this.nodes[`${this.depth},0`];
		return root !== undefined ? root : this.F.toString(this.zeros[this.depth]);
	}

	/**
	 * Cập nhật một chiếc lá và tính toán lại đường dẫn lên tới Root
	 *
	 * @param {number | bigint} index - Vị trí lá (0 đến 2^depth - 1)
	 * @param {import('circomlibjs').BigNumberish} leafValue - Giá trị hash của dữ liệu lá mới
	 * @returns {string} Root mới sau khi cập nhật
	 */
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
