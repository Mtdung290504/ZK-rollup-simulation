pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";

template BinaryHashTree(N_TXS) {
    signal input tx_hashes[N_TXS];
    signal output tree_root;

    // Sử dụng Rolling Hash (Linear Hash) thay cho Merkle Tree
    // h[i+1] = Poseidon(h[i], tx_hash[i])
    component hashers[N_TXS];
    signal hashes[N_TXS + 1];

    hashes[0] <== 0; // Trạng thái khởi tạo

    for (var i = 0; i < N_TXS; i++) {
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== hashes[i];
        hashers[i].inputs[1] <== tx_hashes[i];
        hashes[i+1] <== hashers[i].out;
    }

    tree_root <== hashes[N_TXS];
}