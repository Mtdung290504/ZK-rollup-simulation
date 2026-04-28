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

    signal input tx_type;
    signal input from_x;
    signal input from_y;
    signal input to_x;
    signal input to_y;
    signal input amount;
    signal input fee;
    signal input nonce;
    signal input l1_address;
    signal input deposit_id;
    signal input old_operations_hash;
    
    signal input sig_R8x;
    signal input sig_R8y;
    signal input sig_S;

    signal input sender_balance;
    signal input sender_nonce;
    signal input receiver_pubKey_x;
    signal input receiver_pubKey_y;
    signal input receiver_balance;
    signal input receiver_nonce;

    signal input sender_pathElements[DEPTH];
    signal input sender_pathIndices[DEPTH];
    signal input receiver_pathElements[DEPTH];
    signal input receiver_pathIndices[DEPTH];

    signal input currentRoot;

    signal output newRoot;
    signal output tx_hash; // Xuất hash 9 trường ra cho DA Tree
    signal output new_operations_hash; // Operations Hash cộng dồn cho L1 đối soát

    // Verify Chữ Ký
    component txVerifier = VerifyTxSignature();
    txVerifier.enabled <== enabled;
    txVerifier.tx_type <== tx_type;
    txVerifier.from_x <== from_x;
    txVerifier.from_y <== from_y;
    txVerifier.to_x <== to_x;
    txVerifier.to_y <== to_y;
    txVerifier.amount <== amount;
    txVerifier.fee <== fee; 
    txVerifier.nonce <== nonce;
    txVerifier.l1_address <== l1_address;
    txVerifier.sig_R8x <== sig_R8x; 
    txVerifier.sig_R8y <== sig_R8y; 
    txVerifier.sig_S <== sig_S;

    tx_hash <== txVerifier.msg_hash;

    // *Ngăn kho bạc in tiền khống
    // Cưỡng chế: Mọi giao dịch từ Treasury đều phải dùng Operations Hash
    // Hardcode địa chỉ ví kho bạc
    var TREASURY_X = 20257655333597217740899094985403572455718304473578486559526162687121833363396;
    var TREASURY_Y = 9368438139727990468422623438035078385108414551455247519960932519731843913490;

    // Giao dịch từ kho bạc
    component isTreasuryX = IsEqual(); isTreasuryX.in[0] <== from_x; isTreasuryX.in[1] <== TREASURY_X;
    component isTreasuryY = IsEqual(); isTreasuryY.in[0] <== from_y; isTreasuryY.in[1] <== TREASURY_Y;
    component isFromTreasury = AND(); isFromTreasury.a <== isTreasuryX.out; isFromTreasury.b <== isTreasuryY.out;
    // Và là loại nạp
    component isDeposit = AND(); isDeposit.a <== isFromTreasury.out; isDeposit.b <== enabled;

    // Tính băm cuộn: Poseidon(oldHash, deposit_id, to_x, to_y, amount)
    component ops_hasher = Poseidon(5);
    ops_hasher.inputs[0] <== old_operations_hash;
    ops_hasher.inputs[1] <== deposit_id;
    ops_hasher.inputs[2] <== to_x;
    ops_hasher.inputs[3] <== to_y;
    ops_hasher.inputs[4] <== amount;

    // Chốt: Nếu là deposit thì lấy ops_hasher, nếu không thì bê nguyên old_operations_hash truyền đi
    component ops_mux = Mux1();
    ops_mux.c[0] <== old_operations_hash;
    ops_mux.c[1] <== ops_hasher.out;
    ops_mux.s <== isDeposit.out;

    new_operations_hash <== ops_mux.out;

    // 2. Ràng buộc Logic (Chỉ check khi enabled == 1)

    // Chống In Tiền bằng Underflow/Overflow amount với fee
    // Nếu ai đó ném số âm vào đây (trong Finite Field số âm là con số cực lớn), Num2Bits sẽ báo lỗi.
    component amtBounds = Num2Bits(128); amtBounds.in <== amount;
    component feeBounds = Num2Bits(128); feeBounds.in <== fee;

    // Chống tràn số balance với nonce (dù nonce hiếm)
    component balBounds = Num2Bits(128); balBounds.in <== sender_balance;
    component nonceBounds = Num2Bits(64); nonceBounds.in <== sender_nonce;

    // A. Chặn gửi cho chính mình
    // @deprecated - Chỉ ảnh hưởng đến kinh tế cá nhân người gửi hoặc tài nguyên của chính sequencer
    // Để backend filter là đủ
    // component selfX = IsEqual();
    // selfX.in[0] <== from_x; 
    // selfX.in[1] <== to_x;
    // component selfY = IsEqual();
    // selfY.in[0] <== from_y; 
    // selfY.in[1] <== to_y;
    // component bothSame = AND();
    // bothSame.a <== selfX.out; 
    // bothSame.b <== selfY.out;
    // enabled * bothSame.out === 0;

    // B. Check Đủ tiền
    // Tất cả đều ràng buộc 128-bit, thông thường dùng cổng so sánh 129-bit
    // (Dự phòng 1 bit cho phép cộng amount + fee)
    // NHƯNG, sender_balance đã là 128, nếu amount + fee cần đến 129 thì nó lớn hơn balance
    // => Bất hợp pháp, dùng GreaterEqThan(128) là đủ vì tổng tới 129 nó nổ luôn vì đường nào cũng reject
    signal total_deduct <== amount + fee;
    component geq = GreaterEqThan(128);
    geq.in[0] <== sender_balance;
    geq.in[1] <== total_deduct;
    enabled * (1 - geq.out) === 0;

    // C. Check Nonce khớp
    component nonceCheck = IsEqual();
    nonceCheck.in[0] <== nonce;
    nonceCheck.in[1] <== sender_nonce;
    enabled * (1 - nonceCheck.out) === 0;

    // 3. SENDER: Cập nhật cây Merkle
    
    // Tính balance & nonce của sender sau giao dịch
    signal sender_balance_new <== sender_balance - amount - fee;
    signal sender_nonce_new <== sender_nonce + 1;

    // Tạo leaf cũ và mới
    component sender_leaf_old = AccountLeaf();
    sender_leaf_old.pubKey_x <== from_x; 
    sender_leaf_old.pubKey_y <== from_y;
    sender_leaf_old.balance <== sender_balance;
    sender_leaf_old.nonce <== sender_nonce;

    // Cập nhật cây Merkle
    component sender_updater = MerkleTreeUpdater(DEPTH);
    sender_updater.leaf_old <== sender_leaf_old.leaf;
    
    component sender_leaf_new = AccountLeaf();
    sender_leaf_new.pubKey_x <== from_x; 
    sender_leaf_new.pubKey_y <== from_y;
    sender_leaf_new.balance <== sender_balance_new;
    sender_leaf_new.nonce <== sender_nonce_new;
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

    // 4. KIỂM TRA NGƯỜI NHẬN
    // Tính toán lá cũ của Receiver dựa trên số liệu Sequencer cung cấp
    component receiver_leaf_old = AccountLeaf();
    receiver_leaf_old.pubKey_x <== receiver_pubKey_x; 
    receiver_leaf_old.pubKey_y <== receiver_pubKey_y;
    receiver_leaf_old.balance <== receiver_balance; 
    receiver_leaf_old.nonce <== receiver_nonce;

    // Mã băm của một "Ví rỗng" đã precompute để tối ưu constraints: Poseidon(0,0,0,0)
    var EMPTY_LEAF = 2351654555892372227640888372176282444150254868378439619268573230312091195718;

    // So sánh: Cái lá Sequencer đưa vào có CHÍNH XÁC là lá rỗng không?
    component isNewAccount = IsEqual();
    isNewAccount.in[0] <== receiver_leaf_old.leaf;
    isNewAccount.in[1] <== EMPTY_LEAF;

    // Thì pubKey do Sequencer cung cấp BẮT BUỘC phải khớp với to_x, to_y của chữ ký
    component checkRx = ForceEqualIfEnabled();
    checkRx.enabled <== enabled * (1 - isNewAccount.out);
    checkRx.in[0] <== receiver_pubKey_x;
    checkRx.in[1] <== to_x;

    component checkRy = ForceEqualIfEnabled();
    checkRy.enabled <== enabled * (1 - isNewAccount.out);
    checkRy.in[0] <== receiver_pubKey_y;
    checkRy.in[1] <== to_y;

    // Nếu là ví mới, tự động ép balance và nonce về 0 để tính toán leaf mới an toàn
    // Tránh thằng seq in tiền vào tài khoản mới
    // Mux1: Nếu s=1 thì lấy c[1], nếu s=0 thì lấy c[0]
    component muxBal = Mux1(); muxBal.c[0] <== receiver_balance; muxBal.c[1] <== 0; muxBal.s <== isNewAccount.out;
    component muxNonce = Mux1(); muxNonce.c[0] <== receiver_nonce; muxNonce.c[1] <== 0; muxNonce.s <== isNewAccount.out;

    signal safe_receiver_balance <== muxBal.out;
    signal safe_receiver_nonce <== muxNonce.out;

    // Lấy đúng địa chỉ đích do người dùng ký (to_x, to_y) để gán cho ví mới
    signal final_receiver_x <== to_x;
    signal final_receiver_y <== to_y;

    // 5. RECEIVER: Cập nhật cây Merkle
    signal receiver_balance_new <== safe_receiver_balance + amount;

    component receiver_updater = MerkleTreeUpdater(DEPTH);
    receiver_updater.leaf_old <== receiver_leaf_old.leaf;

    // Đóng gói lá mới cho Receiver
    component receiver_leaf_new = AccountLeaf();
    receiver_leaf_new.pubKey_x <== final_receiver_x; 
    receiver_leaf_new.pubKey_y <== final_receiver_y;
    receiver_leaf_new.balance <== receiver_balance_new; 
    receiver_leaf_new.nonce <== safe_receiver_nonce;
    
    receiver_updater.leaf_new <== receiver_leaf_new.leaf;

    for (var i = 0; i < DEPTH; i++) {
        receiver_updater.pathElements[i] <== receiver_pathElements[i];
        receiver_updater.pathIndices[i] <== receiver_pathIndices[i];
    }

    // Nối Gốc: Gốc cũ của Receiver phải khớp với Gốc mới của Sender
    // Vì sender trừ tiền xong, trạng thái thay đổi, phải dùng cái root state đó bỏ vào làm old của receiver
    component checkReceiverRoot = ForceEqualIfEnabled();
    checkReceiverRoot.enabled <== enabled;
    checkReceiverRoot.in[0] <== receiver_updater.root_old;
    checkReceiverRoot.in[1] <== intermediateRoot;

    // 6. Xuất ROOT theo ENABLED
    // Vì nếu enabled=0 thì giao dịch này là giao dịch pad, coi như một giao dịch rác
    // Không cập nhật state root bằng giao dịch rác
    component rootMux = Mux1();
    rootMux.c[0] <== currentRoot;               // Nếu Padding: Giữ nguyên Root cũ của mạng
    rootMux.c[1] <== receiver_updater.root_new; // Nếu Thực: Lấy Root mới nhất
    rootMux.s <== enabled;

    newRoot <== rootMux.out;
}