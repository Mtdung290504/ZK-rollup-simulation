pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";

// Tính Leaf Value của một account
template AccountLeaf() {
    signal input pubKey_x;  // public key X
    signal input pubKey_y;  // public key Y
    signal input balance;   // số dư hiện tại
    signal input nonce;     // nonce hiện tại

    signal output leaf;     // Poseidon(pubKey_x, pubKey_y, balance, nonce)

    component poseidon = Poseidon(4);
    poseidon.inputs[0] <== pubKey_x;
    poseidon.inputs[1] <== pubKey_y;
    poseidon.inputs[2] <== balance;
    poseidon.inputs[3] <== nonce;

    leaf <== poseidon.out;
}
