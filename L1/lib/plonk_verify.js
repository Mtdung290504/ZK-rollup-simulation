import * as snarkjs from 'snarkjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VK_PATH = path.join(__dirname, '..', 'verification_key.json');

let vkCache = null;

export async function verifyPlonkProof(proof, publicSignals) {
	if (!vkCache) {
		if (!fs.existsSync(VK_PATH)) {
			console.error('[L1] verification_key.json not found in L1 directory!');
			return false;
		}
		vkCache = JSON.parse(fs.readFileSync(VK_PATH, 'utf8'));
	}

	try {
		return await snarkjs.plonk.verify(vkCache, publicSignals, proof);
	} catch (err) {
		console.error('[L1] Plonk Verify error:', err.message);
		return false;
	}
}
