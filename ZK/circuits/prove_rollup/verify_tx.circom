pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/eddsaposeidon.circom";

template VerifyTxSignature() {
    signal input enabled; // 1 = Real, 0 = Padding
    
    signal input tx_type; // 0 = Transfer, 1 = Deposit, 2 = Withdraw
    signal input from_x;
    signal input from_y;
    signal input to_x;
    signal input to_y;
    signal input amount;
    signal input fee;
    signal input nonce;
    signal input l1_address;
    
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    signal output msg_hash;

    // Tính Hash thông điệp chuẩn 9-field: Poseidon(tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address)
    component msg_hasher = Poseidon(9);
    msg_hasher.inputs[0] <== tx_type;
    msg_hasher.inputs[1] <== from_x;
    msg_hasher.inputs[2] <== from_y;
    msg_hasher.inputs[3] <== to_x;
    msg_hasher.inputs[4] <== to_y;
    msg_hasher.inputs[5] <== amount;
    msg_hasher.inputs[6] <== fee;
    msg_hasher.inputs[7] <== nonce;
    msg_hasher.inputs[8] <== l1_address;
    
    msg_hash <== msg_hasher.out;

    // Verify chữ ký EdDSA (Tắt verify nếu enabled = 0)
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled;
    eddsa.Ax <== from_x;
    eddsa.Ay <== from_y;
    eddsa.M <== msg_hash;
    eddsa.R8x <== sig_R8x;
    eddsa.R8y <== sig_R8y;
    eddsa.S <== sig_S;
}