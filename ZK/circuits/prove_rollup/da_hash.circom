pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";

/**
 * Quan trọng: N_TXS PHẢI là lũy thừa của 2 (ví dụ: 4, 8, 16)
 */
template BinaryHashTree(N_TXS) {
    signal input tx_hashes[N_TXS];
    signal output tree_root;

    // Tổng số nút trung gian trong cây Merkle nhị phân là N - 1
    var n_nodes = N_TXS - 1;
    component hashers[n_nodes];

    // Full cây nhị phân có thể biểu diễn trong 1 mảng 2n - 1 phần tử
    signal node_hashes[2 * N_TXS - 1];

    // Đưa các lá vào mảng node_hashes (phần cuối mảng)
    // node_hashes[n_nodes + i] là lá thứ i
    for (var i = 0; i < N_TXS; i++) {
        node_hashes[n_nodes + i] <== tx_hashes[i];
    }

    // Tính toán ngược lên từ lá đến gốc
    // node_hashes[i] = Poseidon(node_hashes[2*i+1], node_hashes[2*i+2])
    for (var i = n_nodes - 1; i >= 0; i--) {
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== node_hashes[2 * i + 1];
        hashers[i].inputs[1] <== node_hashes[2 * i + 2];
        node_hashes[i] <== hashers[i].out;
    }

    tree_root <== node_hashes[0];
}

// @deprecated - Note, nhớ sửa sequencer băm cho đúng
// template BinaryHashTree(N_TXS) {
//     signal input tx_hashes[N_TXS];
//     signal output tree_root;

//     // Sử dụng Rolling Hash (Linear Hash) thay cho Merkle Tree
//     // h[i+1] = Poseidon(h[i], tx_hash[i])
//     component hashers[N_TXS];
//     signal hashes[N_TXS + 1];

//     hashes[0] <== 0; // Trạng thái khởi tạo

//     for (var i = 0; i < N_TXS; i++) {
//         hashers[i] = Poseidon(2);
//         hashers[i].inputs[0] <== hashes[i];
//         hashers[i].inputs[1] <== tx_hashes[i];
//         hashes[i+1] <== hashers[i].out;
//     }

//     tree_root <== hashes[N_TXS];
// }