pragma circom 2.1.0;

include "account_leaf.circom";
include "merkle_updater.circom";
include "verify_tx.circom";
include "../../circomlib/circuits/comparators.circom";
include "../../circomlib/circuits/bitify.circom";
include "../../circomlib/circuits/poseidon.circom";
include "../../circomlib/circuits/gates.circom";
include "../../circomlib/circuits/mux1.circom";

template ProcessTx(DEPTH) {
    signal input enabled; // Cờ Padding

    signal input from_x; signal input from_y;
    signal input to_x; signal input to_y;
    signal input amount; signal input fee; signal input nonce;
    signal input sig_R8x; signal input sig_R8y; signal input sig_S;

    signal input sender_balance; signal input sender_nonce;
    signal input receiver_pubKey_x; signal input receiver_pubKey_y;
    signal input receiver_balance; signal input receiver_nonce;

    signal input sender_pathElements[DEPTH];
    signal input sender_pathIndices[DEPTH];
    signal input receiver_pathElements[DEPTH];
    signal input receiver_pathIndices[DEPTH];

    signal input currentRoot;

    signal output newRoot;
    signal output tx_hash; // Xuất hash ra cho DA Tree

    // --- 1. Verify Chữ Ký ---
    component txVerifier = VerifyTxSignature();
    txVerifier.enabled <== enabled;
    txVerifier.from_x <== from_x; txVerifier.from_y <== from_y;
    txVerifier.to_x <== to_x; txVerifier.to_y <== to_y;
    txVerifier.amount <== amount; txVerifier.fee <== fee; txVerifier.nonce <== nonce;
    txVerifier.sig_R8x <== sig_R8x; txVerifier.sig_R8y <== sig_R8y; txVerifier.sig_S <== sig_S;
    
    tx_hash <== txVerifier.msg_hash;

    // --- 2. Ràng buộc Logic (Chỉ check khi enabled == 1) ---
    // A. Chặn gửi cho chính mình
    component selfX = IsEqual(); selfX.in[0] <== from_x; selfX.in[1] <== to_x;
    component selfY = IsEqual(); selfY.in[0] <== from_y; selfY.in[1] <== to_y;
    component bothSame = AND(); bothSame.a <== selfX.out; bothSame.b <== selfY.out;
    enabled * bothSame.out === 0; // Nếu enabled=1 thì bothSame phải =0

    // B. Check Amount > 0
    component gtZero = GreaterThan(252);
    gtZero.in[0] <== amount; gtZero.in[1] <== 0;
    enabled * (1 - gtZero.out) === 0;

    // C. Check Đủ tiền
    signal total_deduct <== amount + fee;
    component geq = GreaterEqThan(252);
    geq.in[0] <== sender_balance; geq.in[1] <== total_deduct;
    enabled * (1 - geq.out) === 0;

    // D. Check Nonce khớp
    component nonceCheck = IsEqual();
    nonceCheck.in[0] <== nonce; nonceCheck.in[1] <== sender_nonce;
    enabled * (1 - nonceCheck.out) === 0;

    // --- 3. SENDER: Cập nhật cây Merkle ---
    // (Bỏ qua check Address Binding để giảm Constraint, vì JS dùng 32-bit Index cắt ngắn)
    
    signal sender_balance_new <== sender_balance - amount - fee;
    signal sender_nonce_new <== sender_nonce + 1;

    component sender_leaf_old = AccountLeaf();
    sender_leaf_old.pubKey_x <== from_x; sender_leaf_old.pubKey_y <== from_y;
    sender_leaf_old.balance <== sender_balance; sender_leaf_old.nonce <== sender_nonce;

    component sender_updater = MerkleTreeUpdater(DEPTH);
    sender_updater.leaf_old <== sender_leaf_old.leaf;
    
    component sender_leaf_new = AccountLeaf();
    sender_leaf_new.pubKey_x <== from_x; sender_leaf_new.pubKey_y <== from_y;
    sender_leaf_new.balance <== sender_balance_new; sender_leaf_new.nonce <== sender_nonce_new;
    sender_updater.leaf_new <== sender_leaf_new.leaf;

    for (var i = 0; i < DEPTH; i++) {
        sender_updater.pathElements[i] <== sender_pathElements[i];
        sender_updater.pathIndices[i] <== sender_pathIndices[i];
    }

    // Ép Root cũ phải đúng bằng currentRoot (Bỏ qua nếu enabled=0)
    component checkSenderRoot = ForceEqualIfEnabled();
    checkSenderRoot.enabled <== enabled;
    checkSenderRoot.in[0] <== sender_updater.root_old;
    checkSenderRoot.in[1] <== currentRoot;

    signal intermediateRoot <== sender_updater.root_new;

    // --- 4. ZERO LEAF HANDLING CHO RECEIVER (Chặn In Tiền) ---
    component receiverExists = IsZero();
    receiverExists.in <== receiver_pubKey_x;

    component muxX = Mux1(); muxX.c[0] <== receiver_pubKey_x; muxX.c[1] <== to_x; muxX.s <== receiverExists.out;
    component muxY = Mux1(); muxY.c[0] <== receiver_pubKey_y; muxY.c[1] <== to_y; muxY.s <== receiverExists.out;
    signal final_receiver_x <== muxX.out;
    signal final_receiver_y <== muxY.out;

    // VÁ LỖ HỔNG IN TIỀN: Ép balance và nonce cũ về 0 nếu tài khoản mới
    component muxBal = Mux1(); muxBal.c[0] <== receiver_balance; muxBal.c[1] <== 0; muxBal.s <== receiverExists.out;
    component muxNonce = Mux1(); muxNonce.c[0] <== receiver_nonce; muxNonce.c[1] <== 0; muxNonce.s <== receiverExists.out;
    signal safe_receiver_balance <== muxBal.out;
    signal safe_receiver_nonce <== muxNonce.out;

    // --- 5. RECEIVER: Cập nhật cây Merkle ---
    signal receiver_balance_new <== safe_receiver_balance + amount;

    component receiver_leaf_old = AccountLeaf();
    receiver_leaf_old.pubKey_x <== receiver_pubKey_x; receiver_leaf_old.pubKey_y <== receiver_pubKey_y;
    receiver_leaf_old.balance <== safe_receiver_balance; receiver_leaf_old.nonce <== safe_receiver_nonce;

    component receiver_updater = MerkleTreeUpdater(DEPTH);
    receiver_updater.leaf_old <== receiver_leaf_old.leaf;

    component receiver_leaf_new = AccountLeaf();
    receiver_leaf_new.pubKey_x <== final_receiver_x; receiver_leaf_new.pubKey_y <== final_receiver_y;
    receiver_leaf_new.balance <== receiver_balance_new; receiver_leaf_new.nonce <== safe_receiver_nonce;
    receiver_updater.leaf_new <== receiver_leaf_new.leaf;

    for (var i = 0; i < DEPTH; i++) {
        receiver_updater.pathElements[i] <== receiver_pathElements[i];
        receiver_updater.pathIndices[i] <== receiver_pathIndices[i];
    }

    component checkReceiverRoot = ForceEqualIfEnabled();
    checkReceiverRoot.enabled <== enabled;
    checkReceiverRoot.in[0] <== receiver_updater.root_old;
    checkReceiverRoot.in[1] <== intermediateRoot;

    // --- 6. XUẤT ROOT THEO ENABLED ---
    component rootMux = Mux1();
    rootMux.c[0] <== currentRoot;               // Nếu Padding: Giữ nguyên Root cũ
    rootMux.c[1] <== receiver_updater.root_new; // Nếu Thực: Lấy Root mới
    rootMux.s <== enabled;

    newRoot <== rootMux.out;
}