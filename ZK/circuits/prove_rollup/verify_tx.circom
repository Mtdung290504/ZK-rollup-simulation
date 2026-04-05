pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/eddsaposeidon.circom";

template VerifyTxSignature() {
    signal input enabled; // 1 = Real, 0 = Padding
    
    signal input from_x;
    signal input from_y;
    signal input to_x;
    signal input to_y;
    signal input amount;
    signal input fee;
    signal input nonce;
    
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    signal output msg_hash;

    // 1. Tính địa chỉ người nhận từ PubKey (Khớp với logic JS getAddress)
    component to_addr = Poseidon(2);
    to_addr.inputs[0] <== to_x;
    to_addr.inputs[1] <== to_y;

    // 2. Tính Hash thông điệp (Khớp với JS: poseidon([r.address, amount, fee, nonce]))
    component msg_hasher = Poseidon(4);
    msg_hasher.inputs[0] <== to_addr.out;
    msg_hasher.inputs[1] <== amount;
    msg_hasher.inputs[2] <== fee;
    msg_hasher.inputs[3] <== nonce;
    
    msg_hash <== msg_hasher.out;

    // 3. Verify chữ ký EdDSA (Tắt verify nếu enabled = 0)
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled;
    eddsa.Ax <== from_x;
    eddsa.Ay <== from_y;
    eddsa.M <== msg_hash;
    eddsa.R8x <== sig_R8x;
    eddsa.R8y <== sig_R8y;
    eddsa.S <== sig_S;
}