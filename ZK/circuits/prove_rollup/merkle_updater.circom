pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/mux1.circom";

template MerkleTreeUpdater(DEPTH) {
    signal input leaf_old;
    signal input leaf_new;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    signal output root_old;
    signal output root_new;

    component poseidon_old[DEPTH];
    component poseidon_new[DEPTH];
    component mux_old_left[DEPTH];
    component mux_old_right[DEPTH];
    component mux_new_left[DEPTH];
    component mux_new_right[DEPTH];

    signal hash_old[DEPTH + 1];
    signal hash_new[DEPTH + 1];

    hash_old[0] <== leaf_old;
    hash_new[0] <== leaf_new;

    for (var i = 0; i < DEPTH; i++) {
        // Ràng buộc pathIndices[i] phải là 0 hoặc 1 (boolean constraint)
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Tính nhánh cũ (old branch)
        mux_old_left[i] = Mux1();
        mux_old_left[i].c[0] <== hash_old[i];
        mux_old_left[i].c[1] <== pathElements[i];
        mux_old_left[i].s <== pathIndices[i];

        mux_old_right[i] = Mux1();
        mux_old_right[i].c[0] <== pathElements[i];
        mux_old_right[i].c[1] <== hash_old[i];
        mux_old_right[i].s <== pathIndices[i];

        poseidon_old[i] = Poseidon(2);
        poseidon_old[i].inputs[0] <== mux_old_left[i].out;
        poseidon_old[i].inputs[1] <== mux_old_right[i].out;
        hash_old[i + 1] <== poseidon_old[i].out;

        // Tính nhánh mới (new branch)
        mux_new_left[i] = Mux1();
        mux_new_left[i].c[0] <== hash_new[i];
        mux_new_left[i].c[1] <== pathElements[i];
        mux_new_left[i].s <== pathIndices[i];

        mux_new_right[i] = Mux1();
        mux_new_right[i].c[0] <== pathElements[i];
        mux_new_right[i].c[1] <== hash_new[i];
        mux_new_right[i].s <== pathIndices[i];

        poseidon_new[i] = Poseidon(2);
        poseidon_new[i].inputs[0] <== mux_new_left[i].out;
        poseidon_new[i].inputs[1] <== mux_new_right[i].out;
        hash_new[i + 1] <== poseidon_new[i].out;
    }

    root_old <== hash_old[DEPTH];
    root_new <== hash_new[DEPTH];
}
