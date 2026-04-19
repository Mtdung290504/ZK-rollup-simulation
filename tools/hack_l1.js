import { getPoseidon, poseidonHashArr } from './poseidon.js';
import fs from 'fs';
import path from 'path';

async function hack() {
    const poseidon = await getPoseidon();
    const F = poseidon.F;

    const targetGot = "17403140162030073946780060853574458239575975407126119983813947890526694452227"; // Circom/JS 
    const targetExpected = "8270266578185640588617048636550724686629528371632688852755218168813707985196"; // L1

    console.log("=== BẮT ĐẦU ĐIỀU TRA NGƯỢC HASH ===");

    // Đọc input.json mà user vừa sinh ra
    const inputJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'ZK/circuits/prove_rollup/input.json'), 'utf8'));

    const oldStateRoot = inputJson.oldStateRoot;
    const newStateRoot = inputJson.newStateRoot;
    const old_operations_hash = inputJson.old_operations_hash;
    
    console.log("oldStateRoot:", oldStateRoot);
    console.log("newStateRoot:", newStateRoot);
    console.log("old_operations_hash:", old_operations_hash);

    let daHashesForTree = [];
    for (let i = 0; i < 4; i++) {
        const type = BigInt(inputJson.txs_type[i]);
        const s_x = BigInt(inputJson.txs_from_x[i]);
        const s_y = BigInt(inputJson.txs_from_y[i]);
        const r_x = BigInt(inputJson.txs_to_x[i]);
        const r_y = BigInt(inputJson.txs_to_y[i]);
        const amount = BigInt(inputJson.txs_amount[i]);
        const fee = BigInt(inputJson.txs_fee[i]);
        const old_nonce = BigInt(inputJson.txs_nonce[i]);
        const l1_address = BigInt(inputJson.txs_l1_address[i]);

        const daHash = poseidon([type, s_x, s_y, r_x, r_y, amount, fee, old_nonce, l1_address]);
        daHashesForTree.push(daHash);
    }

    let n_nodes = 3;
    let node_hashes = new Array(7).fill(0n);
    for (let i = 0; i < 4; i++) node_hashes[n_nodes + i] = daHashesForTree[i];
    for (let i = n_nodes - 1; i >= 0; i--) node_hashes[i] = poseidon([node_hashes[2 * i + 1], node_hashes[2 * i + 2]]);
    const daTreeRoot = F.toString(node_hashes[0]);

    console.log("Tái lập DA Root từ input.json:", daTreeRoot);

    const l1_db = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'L1/db/l1_db.json'), 'utf8'));
    const lastProvenId = l1_db.bridge_contract.last_proven_deposit_id ?? -1;
    let opsHashFromL1DB = l1_db.bridge_contract.last_operations_hash || "0";

    const computedOpsHash = poseidon([
        BigInt(old_operations_hash), 
        BigInt(inputJson.txs_deposit_id[0] || -1), 
        BigInt(inputJson.txs_to_x[0]), 
        BigInt(inputJson.txs_to_y[0]), 
        BigInt(inputJson.txs_amount[0])
    ]);

    const mockOpsHashes = [
        BigInt(0), 
        BigInt(old_operations_hash),
        computedOpsHash,
        BigInt(opsHashFromL1DB)
    ];

    let foundGot = null;
    let foundExp = null;

    for (const ops of mockOpsHashes) {
        const pHash = poseidon([BigInt(oldStateRoot), BigInt(newStateRoot), BigInt(daTreeRoot), ops]);
        const pHashStr = F.toString(pHash);
        if (pHashStr === targetGot) {
            foundGot = ops;
            console.log("\n==> JS/Circom (targetGot) đã dùng OpsHash = ", ops.toString());
        }
        if (pHashStr === targetExpected) {
            foundExp = ops;
            console.log("\n==> L1 (targetExpected) đã dùng OpsHash = ", ops.toString());
        }
    }

    if (!foundGot) console.log("Không tìm thấy opsHash khớp với targetGot!");
    if (!foundExp) console.log("Không tìm thấy opsHash khớp với targetExpected!");
}

hack().catch(console.error);
