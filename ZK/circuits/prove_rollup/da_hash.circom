pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";

function nextPowerOf2(n) {
    var count = 0;
    if (n > 0 && (n & (n - 1)) == 0) return n;
    while(n != 0) { n >>= 1; count += 1; }
    return 1 << count;
}

template BinaryHashTree(N_TXS) {
    // Nhận trực tiếp mảng tx_hash từ các ProcessTx (Rất nhẹ)
    signal input tx_hashes[N_TXS];
    signal output tree_root;
    
    var N_PAD = nextPowerOf2(N_TXS);
    component nodes[N_PAD - 1];
    signal node_hashes[2 * N_PAD - 1];

    for (var i = 0; i < N_TXS; i++) {
        node_hashes[i] <== tx_hashes[i];
    }
    for (var i = N_TXS; i < N_PAD; i++) {
        node_hashes[i] <== 0; // Độn 0 cho đủ nhánh cây nhị phân
    }

    var write_idx = N_PAD;
    var read_idx = 0;

    for (var i = 0; i < N_PAD - 1; i++) {
        nodes[i] = Poseidon(2);
        nodes[i].inputs[0] <== node_hashes[read_idx];
        nodes[i].inputs[1] <== node_hashes[read_idx + 1];
        node_hashes[write_idx] <== nodes[i].out;
        
        read_idx += 2;
        write_idx += 1;
    }

    tree_root <== node_hashes[2 * N_PAD - 2];
}