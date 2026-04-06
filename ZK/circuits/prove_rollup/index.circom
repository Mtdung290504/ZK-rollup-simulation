pragma circom 2.1.0;

include "process_tx.circom";
include "da_hash.circom";
include "../../circomlib/circuits/bitify.circom";

template BatchRollup(N_TXS, DEPTH) {
    signal input oldStateRoot;
    signal input newStateRoot;
    signal input publicInputHash;

    signal input operator_pub_x;
    signal input operator_pub_y;
    signal input operator_balance_old;
    signal input operator_nonce;
    signal input operator_pathElements[DEPTH];
    signal input operator_pathIndices[DEPTH];

    signal input txs_enabled[N_TXS];
    signal input txs_from_x[N_TXS];
    signal input txs_from_y[N_TXS];
    signal input txs_to_x[N_TXS];
    signal input txs_to_y[N_TXS];
    signal input txs_amount[N_TXS];
    signal input txs_fee[N_TXS];
    signal input txs_nonce[N_TXS];
    signal input txs_sig_R8x[N_TXS];
    signal input txs_sig_R8y[N_TXS];
    signal input txs_sig_S[N_TXS];

    signal input sender_balances[N_TXS];
    signal input sender_nonces[N_TXS];
    signal input receiver_pubKey_x[N_TXS];
    signal input receiver_pubKey_y[N_TXS];
    signal input receiver_balances[N_TXS];
    signal input receiver_nonces[N_TXS];

    signal input sender_pathElements[N_TXS][DEPTH];
    signal input sender_pathIndices[N_TXS][DEPTH];
    signal input receiver_pathElements[N_TXS][DEPTH];
    signal input receiver_pathIndices[N_TXS][DEPTH];

    component processors[N_TXS];
    signal roots[N_TXS + 1];
    roots[0] <== oldStateRoot;

    signal fees[N_TXS + 1];
    fees[0] <== 0;

    for (var i = 0; i < N_TXS; i++) {
        processors[i] = ProcessTx(DEPTH);
        processors[i].enabled <== txs_enabled[i];
        processors[i].from_x <== txs_from_x[i];
        processors[i].from_y <== txs_from_y[i];
        processors[i].to_x <== txs_to_x[i];
        processors[i].to_y <== txs_to_y[i];
        processors[i].amount <== txs_amount[i];
        processors[i].fee <== txs_fee[i];
        processors[i].nonce <== txs_nonce[i];
        processors[i].sig_R8x <== txs_sig_R8x[i];
        processors[i].sig_R8y <== txs_sig_R8y[i];
        processors[i].sig_S <== txs_sig_S[i];
        processors[i].sender_balance <== sender_balances[i];
        processors[i].sender_nonce <== sender_nonces[i];
        processors[i].receiver_pubKey_x <== receiver_pubKey_x[i];
        processors[i].receiver_pubKey_y <== receiver_pubKey_y[i];
        processors[i].receiver_balance <== receiver_balances[i];
        processors[i].receiver_nonce <== receiver_nonces[i];

        for (var j = 0; j < DEPTH; j++) {
            processors[i].sender_pathElements[j] <== sender_pathElements[i][j];
            processors[i].sender_pathIndices[j] <== sender_pathIndices[i][j];
            processors[i].receiver_pathElements[j] <== receiver_pathElements[i][j];
            processors[i].receiver_pathIndices[j] <== receiver_pathIndices[i][j];
        }
        processors[i].currentRoot <== roots[i];
        roots[i + 1] <== processors[i].newRoot;
        fees[i + 1] <== fees[i] + (txs_fee[i] * txs_enabled[i]);
    }

    component op_leaf_old = AccountLeaf();
    op_leaf_old.pubKey_x <== operator_pub_x;
    op_leaf_old.pubKey_y <== operator_pub_y;
    op_leaf_old.balance <== operator_balance_old;
    op_leaf_old.nonce <== operator_nonce;

    component op_updater = MerkleTreeUpdater(DEPTH);
    op_updater.leaf_old <== op_leaf_old.leaf;
    for (var i = 0; i < DEPTH; i++) {
        op_updater.pathElements[i] <== operator_pathElements[i];
        op_updater.pathIndices[i] <== operator_pathIndices[i];
    }

    signal operator_balance_new <== operator_balance_old + fees[N_TXS];
    
    // TỐI ƯU: Chỉ dùng 64-bit check cho balance thay vì 252-bit
    component checkOpBal = Num2Bits(64);
    checkOpBal.in <== operator_balance_new;

    component op_leaf_new = AccountLeaf();
    op_leaf_new.pubKey_x <== operator_pub_x;
    op_leaf_new.pubKey_y <== operator_pub_y;
    op_leaf_new.balance <== operator_balance_new;
    op_leaf_new.nonce <== operator_nonce;

    op_updater.leaf_new <== op_leaf_new.leaf;
    op_updater.root_old === roots[N_TXS];
    op_updater.root_new === newStateRoot;

    component da_hasher = BinaryHashTree(N_TXS);
    for (var i = 0; i < N_TXS; i++) {
        da_hasher.tx_hashes[i] <== processors[i].tx_hash;
    }

    component root_hash = Poseidon(3);
    root_hash.inputs[0] <== oldStateRoot;
    root_hash.inputs[1] <== newStateRoot;
    root_hash.inputs[2] <== da_hasher.tree_root;
    root_hash.out === publicInputHash;
}

component main {public [oldStateRoot, newStateRoot, publicInputHash]} = BatchRollup(4, 6);