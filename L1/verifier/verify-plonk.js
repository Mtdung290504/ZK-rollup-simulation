import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

/**
 * @param {string} circuitDir
 */
export async function verifyPlonkProof(circuitDir) {
	try {
		const plonkDir = path.join(circuitDir, 'output/plonk');

		const vk = path.join(plonkDir, 'verification_key.json');
		const pub = path.join(plonkDir, 'public.json');
		const proof = path.join(plonkDir, 'proof.json');

		const cmd = `snarkjs plonk verify "${vk}" "${pub}" "${proof}"`;

		const { stdout, stderr } = await execAsync(cmd);

		if (stderr) {
			console.error('stderr:', stderr);
		}

		// snarkjs sẽ in: "OK!" nếu đúng
		console.log(stdout);
		return stdout.includes('OK');
	} catch (err) {
		console.error('Verify CLI error:', err);
		return false;
	}
}

// C:\ZKPs\ZK-rollup\ZK\circuits\prove_rollup.lite
console.log(await verifyPlonkProof(path.resolve(process.cwd(), 'ZK/circuits/prove_rollup.lite')));
