# Thiết kế Circuit cho ZK-Rollup (Payment Rollup) bằng Circom

Mục tiêu: Thiết kế các template Circom cho một ZK-rollup tối giản (payment rollup) trên Ethereum, đảm bảo:

- Không có lỗ hổng logic (đặc biệt là logic cập nhật Merkle Tree tuần tự).
- Ràng buộc đầy đủ — không thiếu constraint, không under-constrained.
- Sử dụng các ZK-friendly primitives: **Poseidon Hash** và **EdDSA (BabyJubJub)**.
- Mô tả rõ input signals (public/private) và output signals.

---

# 1. Mô hình hệ thống

## Sparse Merkle Tree (SMT)

- **Leaf Index** (vị trí lá trong cây) = `Poseidon(pubKey_x, pubKey_y)` → đây là **địa chỉ** của account.
- **Leaf Value** (giá trị lá được hash) = `Poseidon(pubKey_x, pubKey_y, balance, nonce)` → đây là hash của trạng thái account.

> **Phân biệt quan trọng**: `address` (Leaf Index) và `leaf` (Leaf Value) là **hai khái niệm khác nhau**.
>
> - `address` xác định **vị trí** lá trong cây (dùng để đi theo path).
> - `leaf` là **nội dung** hash của lá đó (dùng để verify Merkle proof).
> - `MerkleTreeUpdater` nhận `leaf_old`/`leaf_new` theo nghĩa **Leaf Value**, còn `pathIndices[]` xác định đường đi theo nghĩa **Leaf Index**.

- State toàn cục được biểu diễn bằng Merkle tree root (`stateRoot`).
- **Chiều sâu cây** (tree depth) là hằng số `DEPTH`, phải cố định tại compile-time trong Circom.

---

# 2. Public Inputs (Dành cho Smart Contract Verifier trên Ethereum)

Các signal này được expose ra ngoài circuit và được smart contract kiểm tra:

| Signal            | Ý nghĩa                                                        |
| ----------------- | -------------------------------------------------------------- |
| `oldStateRoot`    | Root của SMT trước khi xử lý batch                             |
| `newStateRoot`    | Root của SMT sau khi xử lý toàn bộ batch                       |
| `publicInputHash` | Hash tổng hợp để đảm bảo Data Availability (chi tiết bên dưới) |

### Định nghĩa `publicInputHash`

```
publicInputHash = Poseidon(
    oldStateRoot,
    newStateRoot,
    tx[0].from_x,  tx[0].from_y,
    tx[0].to_x,    tx[0].to_y,
    tx[0].amount,  tx[0].fee,  tx[0].nonce,
    tx[1].from_x,  tx[1].from_y,
    ...            (lặp lại cho đủ N_TXS tx)
    tx[N-1].from_x, tx[N-1].from_y,
    tx[N-1].to_x,   tx[N-1].to_y,
    tx[N-1].amount, tx[N-1].fee, tx[N-1].nonce
)
```

Kiểu: "Tôi thề là nếu lấy 1000 giao dịch bí mật (Private) có mã băm là publicInputHash, áp dụng vào oldStateRoot, tôi sẽ tính ra đúng newStateRoot."

> ⚠️ **Lý do bắt buộc phải hash phẳng (flat hash)**: Circom không hỗ trợ mảng động. Toàn bộ `N_TXS` phải được cố định tại compile-time. Poseidon trong circomlib hỗ trợ tối đa 16 inputs trong một lần gọi; với N lớn, cần hash nhiều tầng (Merkle-style hoặc chain hash).
>
> **Các fields đưa vào hash là dữ liệu "public" của tx** (`from_x, from_y, to_x, to_y, amount, fee, nonce`). Signature **KHÔNG** đưa vào hash DA (signature là private witness).

---

# 3. Private Inputs (Witness từ Sequencer/Prover)

| Nhóm                     | Chi tiết                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Transaction list**     | `N_TXS` transactions, mỗi tx gồm: `from_x, from_y, to_x, to_y, amount, fee, nonce, sig_R8x, sig_R8y, sig_S` |
| **Sender state**         | `sender_pubKey_x, sender_pubKey_y, sender_balance, sender_nonce` — trạng thái **trước tx**                  |
| **Receiver state**       | `receiver_pubKey_x, receiver_pubKey_y, receiver_balance, receiver_nonce` — trạng thái **trước tx**          |
| **Sender Merkle path**   | `sender_pathElements[DEPTH]`, `sender_pathIndices[DEPTH]`                                                   |
| **Receiver Merkle path** | `receiver_pathElements[DEPTH]`, `receiver_pathIndices[DEPTH]`                                               |

> ⚠️ **Zero-Trust**: Mọi giá trị private input đều bị coi là không tin tưởng. Circuit phải verify chúng hoàn toàn bằng constraint toán học đối chiếu với public input.

---

# 4. Định nghĩa Transaction

Mỗi tx gồm các fields sau:

| Field                         | Loại    | Ghi chú                                                                         |
| ----------------------------- | ------- | ------------------------------------------------------------------------------- |
| `from_x`, `from_y`            | Private | Public key của sender (BabyJubJub)                                              |
| `to_x`, `to_y`                | Private | Public key của receiver                                                         |
| `amount`                      | Private | Số tiền chuyển (không bao gồm fee)                                              |
| `fee`                         | Private | Phí; **bị trừ khỏi sender nhưng không cộng cho ai trong circuit** (xem ghi chú) |
| `nonce`                       | Private | Nonce của sender tại thời điểm gửi tx                                           |
| `sig_R8x`, `sig_R8y`, `sig_S` | Private | EdDSA signature trên message hash                                               |
| `enabled`                     | Private | **0 = Padding (Bỏ qua), 1 = Thực hiện**. Dùng để tối ưu Batch đầy đủ.           |

> **Ghi chú về `fee`**: Trong thiết kế tối giản này, `fee` được trừ khỏi balance của sender nhưng **không được cộng vào bất kỳ account nào trong circuit**. Fee được coi là do operator/sequencer thu ngoài circuit (ví dụ: operator tự cộng vào tài khoản của mình trong một batch riêng, hoặc thông qua cơ chế ngoài chuỗi). Nếu muốn circuit xử lý fee on-chain, cần thêm một MerkleTree update thứ ba cho account operator — điều này làm tăng đáng kể số constraints và nằm ngoài phạm vi thiết kế tối giản này.

---

# 5. Các Template Circom

## 5.1 `AccountLeaf()`

**Mục đích**: Tính Leaf Value của một account.

```
Template AccountLeaf()
  Input signals:
    pubKey_x  -- public key X
    pubKey_y  -- public key Y
    balance   -- số dư hiện tại
    nonce     -- nonce hiện tại

  Output signals:
    leaf      -- Poseidon(pubKey_x, pubKey_y, balance, nonce)

  Constraints:
    leaf <== Poseidon(4)([pubKey_x, pubKey_y, balance, nonce])
```

**Thư viện cần dùng**: `circomlib/circuits/poseidon.circom`

---

## 5.2 `MerkleTreeUpdater(DEPTH)`

**Mục đích**: Verify một Merkle proof VÀ tính root mới, dùng **cùng một bộ siblings** cho cả lá cũ và lá mới.

> ✅ **Đây là đúng**: vì khi chỉ thay một lá, các siblings trên đường path không thay đổi. Chỉ hash trên đường đi từ lá lên root thay đổi.

```
Template MerkleTreeUpdater(DEPTH)
  Input signals:
    leaf_old           -- Leaf Value trước khi thay đổi
    leaf_new           -- Leaf Value sau khi thay đổi
    pathElements[DEPTH] -- Sibling nodes (dùng chung cho cả old và new)
    pathIndices[DEPTH]  -- 0 = lá/nút hiện tại là con trái, 1 = con phải

  Output signals:
    root_old  -- Merkle root tính từ leaf_old + pathElements
    root_new  -- Merkle root tính từ leaf_new + pathElements

  Constraints (lặp DEPTH lần):
    Tầng 0:
      hash_old[0] <== Poseidon(2)(Select(pathIndices[0], leaf_old, pathElements[0]),
                                  Select(pathIndices[0], pathElements[0], leaf_old))
      hash_new[0] <== Poseidon(2)(Select(pathIndices[0], leaf_new, pathElements[0]),
                                  Select(pathIndices[0], pathElements[0], leaf_new))
    Tầng i (i > 0):
      hash_old[i] <== Poseidon(2)(Select(pathIndices[i], hash_old[i-1], pathElements[i]),
                                   Select(pathIndices[i], pathElements[i], hash_old[i-1]))
      hash_new[i] <== tương tự với hash_new[i-1]
    Kết quả:
      root_old <== hash_old[DEPTH-1]
      root_new <== hash_new[DEPTH-1]

  Lưu ý pathIndices[]:
    - Mỗi pathIndices[i] phải là 0 hoặc 1.
    - Cần ràng buộc: pathIndices[i] * (1 - pathIndices[i]) === 0 cho mọi i.
    - Dùng MuxOne hoặc manual 2-to-1 Mux từ circomlib.
```

Note: Khi gọi MerkleTreeUpdater trong ProcessTx, bắt buộc phải có bước so khớp pathIndices với Num2Bits(Address).

**Thư viện cần dùng**: `circomlib/circuits/poseidon.circom`, `circomlib/circuits/mux1.circom`

---

## 5.3 `VerifyTxSignature()`

**Mục đích**: Xác minh EdDSA signature của tx.

```
Template VerifyTxSignature()
  Input signals:
    from_x, from_y        -- Public key của sender
    to_x, to_y            -- Public key của receiver
    amount, fee, nonce    -- Các fields của tx
    sig_R8x, sig_R8y      -- Phần R của signature
    sig_S                 -- Phần S của signature

  Constraints:
    1. Tính message hash:
       msg_hash <== Poseidon(7)([from_x, from_y, to_x, to_y, amount, fee, nonce])
       (7 inputs = số lượng fields "semantic" của tx, không gồm signature)

    2. Verify signature:
       EdDSAPoseidonVerifier()(
         enabled  = 1,
         Ax       = from_x,
         Ay       = from_y,
         R8x      = sig_R8x,
         R8y      = sig_R8y,
         S        = sig_S,
         M        = msg_hash
       )
```

> ⚠️ **Quan trọng**: `EdDSAPoseidonVerifier` từ circomlib nhận `M` là message hash (scalar). Đây phải **khớp hoàn toàn** với cách Prover tính hash khi ký. Nếu Prover ký `Poseidon(from_x, from_y, to_x, to_y, amount, fee, nonce)` thì circuit phải dùng đúng thứ tự và số lượng inputs này.

**Thư viện cần dùng**: `circomlib/circuits/eddsa.circom`, `circomlib/circuits/poseidon.circom`

---

## 5.4 `ProcessTx(DEPTH)`

**Mục đích**: Xử lý một transaction hoàn chỉnh, cập nhật state 2 lần (sender → receiver).

```
Template ProcessTx(DEPTH)
  Input signals:
    // TX details
    from_x, from_y, to_x, to_y, amount, fee, nonce
    sig_R8x, sig_R8y, sig_S

    // Sender state TRƯỚC tx
    sender_balance, sender_nonce

    // Receiver state TRƯỚC tx
    receiver_pubKey_x, receiver_pubKey_y
    receiver_balance, receiver_nonce

    // Merkle paths
    sender_pathElements[DEPTH], sender_pathIndices[DEPTH]
    receiver_pathElements[DEPTH], receiver_pathIndices[DEPTH]

    // Root đầu vào (root của state hiện tại trước tx này)
    currentRoot

  Output signals:
    newRoot  -- Root sau khi xử lý tx

  Constraints (theo thứ tự bắt buộc):

  --- BƯỚC 0: Ràng buộc biến Enabled ---
    enabled * (1 - enabled) === 0 // Bắt buộc chỉ là 0 hoặc 1

  --- BƯỚC 1: Verify Signature ---
    VerifyTxSignature()(from_x, from_y, to_x, to_y, amount, fee, nonce,
                        sig_R8x, sig_R8y, sig_S)

  --- BƯỚC 2: Verify Sender tồn tại trong currentRoot ---
    sender_leaf_old <== AccountLeaf()(from_x, from_y, sender_balance, sender_nonce)
    sender_updater = MerkleTreeUpdater(DEPTH)
    sender_updater.leaf_old       <== sender_leaf_old
    sender_updater.pathElements   <== sender_pathElements
    sender_updater.pathIndices    <== sender_pathIndices
    // root_old của sender phải khớp currentRoot:
    sender_updater.root_old === currentRoot

  --- BƯỚC 3: Verify nonce của sender ---
    // tx.nonce phải bằng nonce hiện tại của sender:
    nonce === sender_nonce
    // Sau tx, nonce tăng 1:
    sender_nonce_new <== sender_nonce + 1

  --- BƯỚC 4: Verify amount hợp lệ và sender đủ balance ---
    // Bước 4a: Kiểm tra amount, fee, balance nằm trong [0, 2^252)
    Num2Bits(252)(amount)
    Num2Bits(252)(fee)
    Num2Bits(252)(sender_balance)
    // Bước 4b: Chống spam — amount phải > 0 (không cho phép zero-amount TX)
    GreaterThan(252)(amount, 0) === 1
    // Bước 4c: Kiểm tra sender_balance >= amount + fee
    total_deduct <== amount + fee
    Num2Bits(252)(total_deduct)   // tránh overflow khi cộng
    GreaterEqThan(252)(sender_balance, total_deduct) === 1

  --- BƯỚC 5: Tính sender state mới ---
    sender_balance_new <== sender_balance - amount - fee

  --- BƯỚC 6: Tính intermediateRoot sau khi update sender ---
    sender_leaf_new <== AccountLeaf()(from_x, from_y, sender_balance_new, sender_nonce_new)
    sender_updater.leaf_new <== sender_leaf_new
    intermediateRoot <== sender_updater.root_new

  --- BƯỚC 7: Verify receiver tồn tại trong intermediateRoot ---
    receiver_leaf_old <== AccountLeaf()(receiver_pubKey_x, receiver_pubKey_y,
                                         receiver_balance, receiver_nonce)
    receiver_updater = MerkleTreeUpdater(DEPTH)
    receiver_updater.leaf_old     <== receiver_leaf_old
    receiver_updater.pathElements <== receiver_pathElements
    receiver_updater.pathIndices  <== receiver_pathIndices
    // root_old của receiver phải khớp intermediateRoot (KHÔNG phải currentRoot):
    receiver_updater.root_old === intermediateRoot

  --- BƯỚC 8: Verify receiver balance không overflow sau khi nhận ---
    receiver_balance_new <== receiver_balance + amount
    Num2Bits(252)(receiver_balance_new)  // nếu overflow sẽ fail ở đây

  --- BƯỚC 9: Tính newRoot sau khi update receiver ---
    receiver_leaf_new <== AccountLeaf()(receiver_pubKey_x, receiver_pubKey_y,
                                         receiver_balance_new, receiver_nonce)
    // receiver_nonce KHÔNG thay đổi (receiver không gửi tx)
    receiver_updater.leaf_new <== receiver_leaf_new
    newRoot <== receiver_updater.root_new

  --- BƯỚC 10: Lựa chọn Output Root (Logic tối ưu Padding) ---
    // Nếu enabled = 1, output là root sau khi update Receiver.
    // Nếu enabled = 0, output giữ nguyên là currentRoot ban đầu.

    component rootMux = Mux1();
    rootMux.c[0] <== currentRoot;      // Khi enabled = 0
    rootMux.c[1] <== receiver_newRoot; // Khi enabled = 1 (kết quả sau Bước 9)
    rootMux.s   <== enabled;

    newRoot <== rootMux.out;
```

**Thư viện cần dùng**:

- `circomlib/circuits/comparators.circom` → `GreaterEqThan`
- `circomlib/circuits/bitify.circom` → `Num2Bits`
- `circomlib/circuits/poseidon.circom`
- `circomlib/circuits/eddsa.circom`

---

## 5.5 `BatchRollup(N_TXS, DEPTH)`

**Mục đích**: Xử lý N transactions theo batch và kiểm tra Data Availability.

```
Template BatchRollup(N_TXS, DEPTH)
  Public input signals:
    oldStateRoot
    newStateRoot
    publicInputHash

  Private input signals:
    txs[N_TXS][...]         -- N transactions, mỗi tx gồm các fields như mục 4
    sender_states[N_TXS][4] -- [pubKey_x, pubKey_y, balance, nonce] của sender
    receiver_states[N_TXS][4]
    sender_paths[N_TXS][DEPTH], sender_indices[N_TXS][DEPTH]
    receiver_paths[N_TXS][DEPTH], receiver_indices[N_TXS][DEPTH]

  Constraints:

  --- Chain root qua từng tx ---
    roots[0] <== oldStateRoot

    for i in 0..N_TXS:
      roots[i+1] <== ProcessTx(DEPTH)(
        tx = txs[i],
        sender_state = sender_states[i],
        receiver_state = receiver_states[i],
        sender_path = sender_paths[i], sender_indices = sender_indices[i],
        receiver_path = receiver_paths[i], receiver_indices = receiver_indices[i],
        currentRoot = roots[i]
      )

    // Ràng buộc root cuối bằng newStateRoot (public input):
    roots[N_TXS] === newStateRoot

  --- Verify Data Availability ---
    // Tính hash từ toàn bộ public data:
    computed_hash <== Poseidon(...)([
        oldStateRoot, newStateRoot,
        txs[0].from_x, txs[0].from_y, txs[0].to_x, txs[0].to_y,
        txs[0].amount, txs[0].fee, txs[0].nonce,
        txs[1].from_x, ...
        txs[N-1].nonce
    ])
    // Với N lớn: chain hash theo tầng, ví dụ batch 8 inputs mỗi lần.

    // Ràng buộc với public input:
    computed_hash === publicInputHash
```

> ⚠️ **Poseidon có giới hạn inputs**: `circomlib/circuits/poseidon.circom` hỗ trợ tối đa 17 inputs mỗi lần gọi. Với N_TXS lớn, cần **chain hash**: chia thành các nhóm nhỏ, hash từng nhóm, rồi hash lại các kết quả nhóm.

---

# 6. Ràng buộc an toàn (CRITICAL SECURITY CONSTRAINTS)

| Lỗ hổng                                                          | Cơ chế phòng tránh trong circuit                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Fake transaction** (kẻ tấn công tạo tx không có chữ ký hợp lệ) | `VerifyTxSignature()` — EdDSA verify bắt buộc                                                                                    |
| **Replay attack** (dùng lại tx cũ)                               | `nonce === sender_nonce` **VÀ** `sender_nonce_new = sender_nonce + 1` — nonce phải bằng đúng nonce hiện tại, không hơn không kém |
| **Double spend / Underflow** (chi quá số dư)                     | `GreaterEqThan(252)(sender_balance, amount + fee)` + `Num2Bits(252)` trên `amount`, `fee`, `balance`                             |
| **Receiver overflow** (cộng balance bị tràn field)               | `Num2Bits(252)(receiver_balance + amount)` — nếu tràn thì Num2Bits sẽ fail                                                       |
| **Mismatch Merkle path** (Prover cung cấp path sai)              | Sender verify với `currentRoot`; Receiver verify với `intermediateRoot` — thứ tự này bảo đảm tuần tự và không thể hoán đổi       |
| **Sender giả mạo** (Prover cung cấp sai state sender)            | `AccountLeaf(sender) → MerkleProof → root_old === currentRoot`                                                                   |
| **pathIndices không phải 0 hoặc 1**                              | `pathIndices[i] * (1 - pathIndices[i]) === 0` trong `MerkleTreeUpdater`                                                          |
| **DA bị giả mạo** (Prover cung cấp publicInputHash sai)          | `computed_hash === publicInputHash` — circuit tự tính hash từ các signal và so sánh                                              |

---

# 7. Nonce Constraint — Chi tiết

Constraint đúng và đầy đủ cho nonce:

```
// Trong ProcessTx:
nonce === sender_nonce          // tx.nonce phải bằng đúng nonce hiện tại
sender_nonce_new <== sender_nonce + 1  // nonce mới = nonce cũ + 1 (không hơn không kém)
```

Lý do tại sao cần cả hai:

- `nonce === sender_nonce`: ngăn replay (tx cũ có nonce thấp hơn sẽ fail).
- `sender_nonce_new = sender_nonce + 1`: ngăn Prover đặt `nonce_new` tùy ý (ví dụ +100).

---

# 8. Phân tích Under-constrained Risks

| Vị trí              | Rủi ro                                                                       | Giải pháp                                                                  |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `MerkleTreeUpdater` | `pathIndices[i]` không bị ép là 0/1 → mux sẽ cho kết quả không xác định      | Thêm `pathIndices[i] * (1 - pathIndices[i]) === 0`                         |
| `ProcessTx`         | Quên ép `amount >= 0` → giá trị âm trong field Fp trông như số dương rất lớn | `Num2Bits(252)(amount)`                                                    |
| `ProcessTx`         | `receiver_balance_new` không bị ép range → có thể wrap-around field          | `Num2Bits(252)(receiver_balance_new)`                                      |
| `ProcessTx`         | Receiver root được verify với `currentRoot` thay vì `intermediateRoot`       | Bắt buộc: `receiver_updater.root_old === intermediateRoot`                 |
| `BatchRollup`       | `roots[i+1]` không được ràng buộc với output của `ProcessTx`                 | Dùng `<==` không phải `<--`                                                |
| `VerifyTxSignature` | Thứ tự inputs cho Poseidon hash khi ký không khớp với circuit                | Phải thống nhất thứ tự: `[from_x, from_y, to_x, to_y, amount, fee, nonce]` |
| `AccountLeaf`       | Thứ tự inputs Poseidon không nhất quán                                       | Phải nhất quán: `[pubKey_x, pubKey_y, balance, nonce]`                     |

---

# 9. Thư viện circomlib cần dùng

| Template                  | File trong circomlib          |
| ------------------------- | ----------------------------- |
| `Poseidon(n)`             | `circuits/poseidon.circom`    |
| `EdDSAPoseidonVerifier()` | `circuits/eddsa.circom`       |
| `Num2Bits(n)`             | `circuits/bitify.circom`      |
| `GreaterEqThan(n)`        | `circuits/comparators.circom` |
| `Mux1()`                  | `circuits/mux1.circom`        |

---

# 10. Nguyên tắc bắt buộc (Zero-Trust Design)

- **KHÔNG tin tưởng bất kỳ private input nào**. Mọi giá trị (balance, nonce, tree root, pathElements) đều phải được ràng buộc toán học đối chiếu với public input.
- **Mọi phép gán** phải dùng `<==` (gán + tạo constraint), **tuyệt đối không dùng** `<--` (gán không constraint) trừ khi ngay sau đó có constraint tường minh kiểm tra giá trị đó.
- **Thứ tự update Merkle Tree là bất biến**: Sender trước (verify với `currentRoot`) → tính `intermediateRoot` → Receiver sau (verify với `intermediateRoot`). Không được đảo thứ tự.

---

# 11. Edge Cases Bắt buộc Xử lý

## 11.A Self-Transfer (Tự chuyển tiền cho chính mình)

**Vấn đề**: Nếu `from_x == to_x` và `from_y == to_y`, sender và receiver là cùng một account.

**Hậu quả**: Sau khi ProcessTx update sender vào `intermediateRoot`, lá của sender trong cây đã mang **balance mới (đã trừ)**. Tuy nhiên bước verify receiver lại dùng `receiver_balance` = private input cũ (balance trước tx) → `AccountLeaf(receiver)` sẽ không khớp với lá trong `intermediateRoot` → proof luôn fail.

Tuy proof tự fail, việc không có constraint tường minh khiến **Prover vẫn phải tính toán toàn bộ witness trước khi biết proof sẽ fail** — lãng phí thời gian. Hơn nữa, để tránh mọi edge case logic không lường trước, nên chặn sớm.

**Fix bắt buộc trong `ProcessTx`**:

```circom
// Chặn self-transfer ngay đầu template
component selfX = IsEqual();
selfX.in[0] <== from_x;
selfX.in[1] <== to_x;

component selfY = IsEqual();
selfY.in[0] <== from_y;
selfY.in[1] <== to_y;

// Cả X và Y đều phải khác nhau (check cả hai để an toàn trên BabyJubJub)
// Nếu X bằng nhau VÀ Y bằng nhau → cùng key → fail
component bothSame = AND();
bothSame.a <== selfX.out;
bothSame.b <== selfY.out;
bothSame.out === 0;
```

> ⚠️ **Tại sao phải check cả X và Y**: Trên đường cong BabyJubJub, một điểm `(x, y)` và điểm đối xứng `(x, -y)` có cùng tọa độ X nhưng là hai public key khác nhau. Chỉ check `from_x !== to_x` là **không đủ** — hai public key có thể khác nhau nhưng cùng X. Check cả hai đảm bảo chắc chắn.

**Thư viện cần dùng**: `circomlib/circuits/comparators.circom` → `IsEqual`; `circomlib/circuits/gates.circom` → `AND`

---

## 11.B Zero Leaf / Empty Leaf (Tài khoản mới chưa tồn tại)

**Vấn đề**: Nếu receiver là người dùng mới hoàn toàn, slot của họ trong SMT đang là một **lá rỗng** (empty leaf). Khi đó:

- Receiver chưa có data thực (`pubKey = [0, 0]`, `balance = 0`, `nonce = 0`).
- `AccountLeaf(0, 0, 0, 0)` = `Poseidon(0, 0, 0, 0)` — một giá trị hash cụ thể, **không phải 0**.
- Nếu cây khởi tạo với lá rỗng = giá trị `0` (thay vì `Poseidon(0,0,0,0)`), sẽ bị mismatch → proof fail.

**Chuẩn bắt buộc cho toàn hệ thống**:

```
emptyLeaf = Poseidon(4)([0, 0, 0, 0])
```

Mọi slot chưa được sử dụng trong SMT **phải** được khởi tạo với giá trị `emptyLeaf` này (tính offline khi build cây). Đây là giá trị hằng số, tính một lần duy nhất khi deploy.

**Hỗ trợ trong `ProcessTx` cho receiver mới**:

Khi receiver chưa tồn tại, Prover cung cấp:

```
receiver_pubKey_x = 0
receiver_pubKey_y = 0
receiver_balance  = 0
receiver_nonce    = 0
```

Circuit tính `receiver_leaf_old = AccountLeaf(0, 0, 0, 0)` → verify với Merkle path → khớp với slot rỗng trong `intermediateRoot` → hợp lệ.

Sau tx, circuit tính:

```
receiver_leaf_new = AccountLeaf(to_x, to_y, amount, 0)
```

Account mới của receiver được ghi vào cây với đúng pubkey, balance = amount, nonce = 0.

> ⚠️ **Quan trọng**: Constraint phải check receiver pubkey nhất quán. Nếu `receiver_pubKey_x == 0 && receiver_pubKey_y == 0` (empty slot), `receiver_leaf_new` phải dùng `to_x, to_y` từ tx — không phải `receiver_pubKey_x, receiver_pubKey_y`. Cần xử lý logic này tường minh:
>
> ```circom
> // Nếu receiver là empty (pubkey = 0), dùng to_x/to_y từ tx làm pubkey mới
> // Nếu receiver đã có account, pubkey phải khớp với to_x/to_y
> component receiverExists = IsZero();
> receiverExists.in <== receiver_pubKey_x; // X=0 → empty slot
>
> // ⚠️ KHÔNG dùng phép nhân signal trực tiếp (tạo quadratic constraint):
> //   final_receiver_x <== receiverExists.out * to_x + ...; // SAI — non-linear
> //
> // ĐÚNG: Dùng Mux1() từ circomlib — linear, tối ưu constraints:
> component muxX = Mux1();
> muxX.c[0] <== receiver_pubKey_x; // receiver_pubKey_x nếu đã tồn tại
> muxX.c[1] <== to_x;              // to_x nếu là empty slot mới
> muxX.s    <== receiverExists.out; // selector: 1 = empty, 0 = existing
> final_receiver_x <== muxX.out;
>
> component muxY = Mux1();
> muxY.c[0] <== receiver_pubKey_y;
> muxY.c[1] <== to_y;
> muxY.s    <== receiverExists.out;
> final_receiver_y <== muxY.out;
>
> // Nếu receiver đã tồn tại, phải đảm bảo to_x/to_y khớp với pubkey đã đăng ký
> component checkX = ForceEqualIfEnabled();
> checkX.enabled <== 1 - receiverExists.out;
> checkX.in[0]   <== receiver_pubKey_x;
> checkX.in[1]   <== to_x;
> // tương tự cho Y
> ```

**Thư viện cần dùng**: `circomlib/circuits/comparators.circom` → `IsZero`, `ForceEqualIfEnabled`; `circomlib/circuits/mux1.circom` → `Mux1`

---

## 11.C DA Hash — Binary Tree thay vì Linear Chain

**Vấn đề**: Nếu dùng **linear chain hash** để tính `publicInputHash` với N_TXS lớn:

```
h1 = Poseidon(chunk_1)
h2 = Poseidon(h1, chunk_2)
h3 = Poseidon(h2, chunk_3)
...
hN = Poseidon(h(N-1), chunk_N)
```

Độ sâu circuit = N → số constraints tăng tuyến tính và **critical path** của circuit dài, ảnh hưởng đến thời gian proving.

**Fix — Dùng Binary Tree Hash**:

```
Tầng 0 (leaf): hash các chunk dữ liệu tx từng cặp
  h[0][0] = Poseidon(chunk_0, chunk_1)
  h[0][1] = Poseidon(chunk_2, chunk_3)
  ...

Tầng 1:
  h[1][0] = Poseidon(h[0][0], h[0][1])
  h[1][1] = Poseidon(h[0][2], h[0][3])
  ...

...tiếp tục cho đến khi còn 1 node → publicInputHash
```

**Lợi ích**:

- Độ sâu circuit = `log2(N)` thay vì `N` → ít constraints hơn đáng kể.
- Thời gian prove giảm (critical path ngắn hơn).

> **Lưu ý**: N_TXS phải là lũy thừa của 2 (ví dụ: 4, 8, 16, 32...) để binary tree đều. Nếu không, cần padding bằng `emptyLeaf` hoặc giá trị zero.

**Khuyến nghị**: Định nghĩa một constant `CHUNK_SIZE = 7` (7 fields public mỗi tx: `from_x, from_y, to_x, to_y, amount, fee, nonce`) và thiết kế template `BinaryHashTree(N_TXS)` riêng cho phần DA trong `BatchRollup`.

---

## 11.D Path-Address Binding (Ràng buộc vị trí lá trong SMT)

**Vấn đề**: `pathIndices[]` là private input do Prover cung cấp. Mạch hiện tại verify rằng leaf + pathElements + pathIndices → root hợp lệ, nhưng **không có constraint nào bắt buộc `pathIndices` phải là biểu diễn nhị phân của address** (`Poseidon(pubKey_x, pubKey_y)`).

**Kịch bản tấn công**: Một Sequencer độc hại xây cây offline và chèn thêm một lá thứ hai cho Alice tại một vị trí ngẫu nhiên (ví dụ index 999), với leaf value hợp lệ (hash đúng từ pubkey Alice) nhưng balance = 0. Khi Alice gửi tx, Sequencer truyền `pathIndices` trỏ đến lá giả → mạch verify thành công (root khớp, leaf hash khớp) nhưng dùng balance sai → tx của Alice bị fail oan với lý do "không đủ tiền", trong khi Verifier contract không hề phát hiện.

> ⚠️ **Mức độ nghiêm trọng**: Đây là lỗ hổng **censorship / asset freezing** — Sequencer có thể chặn bất kỳ giao dịch nào mà không để lại bằng chứng trên chain. Proof vẫn pass, chỉ có tx của nạn nhân luôn bị revert.

**Fix bắt buộc trong `ProcessTx`** — thêm sau khi tính được address, trước khi gọi `MerkleTreeUpdater`:

```circom
// ─── SENDER PATH-ADDRESS BINDING ───────────────────────────────────────────
// Tính địa chỉ (leaf index) của sender từ public key
component sender_addr_hash = Poseidon(2);
sender_addr_hash.inputs[0] <== from_x;
sender_addr_hash.inputs[1] <== from_y;

// Phân rã địa chỉ thành DEPTH bits (bit thấp nhất = tầng đầu tiên của path)
component sender_addr_bits = Num2Bits(DEPTH);
sender_addr_bits.in <== sender_addr_hash.out;

// Ràng buộc: pathIndices phải khớp bit-by-bit với địa chỉ
for (var i = 0; i < DEPTH; i++) {
    sender_pathIndices[i] === sender_addr_bits.out[i];
}

// ─── RECEIVER PATH-ADDRESS BINDING ─────────────────────────────────────────
// Dùng final_receiver_x/y (đã qua Mux1 ở 11.B) để đảm bảo nhất quán
// với logic Empty Leaf: nếu receiver mới, địa chỉ tính từ to_x/to_y;
// nếu receiver cũ, địa chỉ tính từ receiver_pubKey_x/y đã đăng ký.
component receiver_addr_hash = Poseidon(2);
receiver_addr_hash.inputs[0] <== final_receiver_x;  // từ Mux1 ở 11.B
receiver_addr_hash.inputs[1] <== final_receiver_y;

component receiver_addr_bits = Num2Bits(DEPTH);
receiver_addr_bits.in <== receiver_addr_hash.out;

for (var i = 0; i < DEPTH; i++) {
    receiver_pathIndices[i] === receiver_addr_bits.out[i];
}
```

> **Lưu ý kỹ thuật**:
>
> - Dùng `Num2Bits(DEPTH)` không phải `Num2Bits(252)`: chỉ cần `DEPTH` bits thấp nhất của address (vì cây chỉ có độ sâu `DEPTH`).
> - Ràng buộc này thêm `2 × DEPTH` constraints tuyến tính — rất nhẹ so với lợi ích bảo mật.
> - `pathIndices[i]` đã được ép là 0/1 ở bước `pathIndices[i] * (1 - pathIndices[i]) === 0` trong `MerkleTreeUpdater` — constraint này vẫn cần giữ nguyên.

**Thư viện cần dùng**: `circomlib/circuits/poseidon.circom` → `Poseidon(2)`; `circomlib/circuits/bitify.circom` → `Num2Bits`

## 11.E Xử lý Padding Transaction (Enabled = 0)

Khi một giao dịch có `enabled = 0`, mạch phải đảm bảo:

1. **Không thay đổi State**: `newRoot` phải bằng `currentRoot`.
2. **Bỏ qua Verify**: Các ràng buộc về Signature, Nonce và Balance phải được "tháo khoán" (thường bằng cách dùng `ForceEqualIfEnabled` hoặc nhân kết quả check với biến `enabled`) để không làm hỏng toàn bộ Batch.
3. **Data Availability**: Trong `publicInputHash`, các giao dịch có `enabled = 0` vẫn phải được hash theo cấu trúc cố định (thường dùng giá trị 0) để Verifier trên L1 có thể khớp lệnh.
