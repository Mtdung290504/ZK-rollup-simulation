# Thiết kế ZK-Rollup này sử dụng Cây Merkle thưa (Sparse Merkle Tree - SMT)

- Đây là một cái cây được "khởi tạo sẵn" với kích thước khổng lồ, thường có chiều sâu là $256$ hoặc tuỳ chỉnh (DEPTH). Số lượng lá của nó là vô tận (ví dụ $2^{252}$ lá). Ban đầu, 99.99% các lá này là "lá rỗng" (Empty Leaf).
- Cách xếp chỗ: Thay vì xếp hàng 0, 1, 2... hệ thống lấy khóa công khai đem đi băm (Hash). Kết quả mã băm là một con số ngẫu nhiên cực lớn. Hệ thống dùng luôn con số này làm Tọa độ (Index) của user trên cây. Dãy nhị phân của mã băm đó (ví dụ `10110...`) sẽ chỉ đường: **1 là rẽ phải, 0 là rẽ trái, đi từ gốc (root) xuống tận lá (leaf).**

## Bí mật của SMT: "Cây rỗng được tính trước"

- Đúng là với $2^{252}$ lá, nếu băm (hash) theo kiểu truyền thống (mỗi giây băm 1 triệu lần), sẽ mất hàng tỷ năm mới tính được tới Root. Nhưng SMT có một đặc điểm: Hầu hết các lá đều rỗng và giống hệt nhau.
    1. Mẹo "Số không" (Zero Hashes) - Vì ban đầu tất cả các "ngăn tủ" đều trống, nội dung của chúng đều là 0 (hoặc một giá trị mặc định):
        - Tầng 0 (Lá): Tất cả đều là $H_0 = 0$.
        - Tầng 1: Tất cả đều là $H_1 = \text{Poseidon}(H_0, H_0)$.
        - Tầng 2: Tất cả đều là $H_2 = \text{Poseidon}(H_1, H_1)$.
        - ... cho đến Root.\
          Các giá trị này ($H_0, H_1, H_2...$) được tính sẵn một lần duy nhất và lưu vào một mảng cố định, không cần băm lại chúng mỗi khi tính Root.
    2. Chỉ băm trên "Đường đi" (Path) - Giả sử cái tủ có $2^{20}$ ngăn, nhưng hiện tại chỉ có duy nhất Alice gửi tiền vào ngăn số 999. Để tính Root mới, không cần quan tâm đến hàng triệu ngăn rỗng kia, chỉ cần:
        - Lấy nội dung mới của Alice ở ngăn 999.
        - Lấy các "anh em" (siblings) nằm trên đường từ ngăn 999 lên tới đỉnh.
            - Nếu "anh em" của Alice là một nhánh rỗng $\rightarrow$ bốc ngay giá trị $H_n$ đã tính sẵn ở trên vào.
            - Chỉ tốn đúng 20 lần băm (tương ứng với độ sâu DEPTH) để lên tới Root.
        - Kết luận: Dù cây có to đến đâu, mỗi lần cập nhật chỉ tốn đúng số lần băm bằng DEPTH (ví dụ 20 hoặc 32 lần). Đây là lý do tại sao trong bản thiết kế, mạch MerkleTreeUpdater chỉ nhận vào mảng pathElements[DEPTH] chứ không nhận cả cái cây.

## Quan hệ giữa Key và Địa chỉ

- Trên Ethereum L1: Private Key $\rightarrow$ Elliptic Curve (secp256k1) $\rightarrow$ Public Key $\rightarrow$ Keccak256 $\rightarrow$ Lấy 20 bytes cuối $\rightarrow$ 0x123...abc.
- Trong ZK-Rollup: Private Key $\rightarrow$ BabyJubJub Curve $\rightarrow$ Public Key $(X, Y)$ $\rightarrow$ Poseidon Hash $\rightarrow$ Một con số cực lớn. Con số này chính là địa chỉ, và cũng chính là vị trí (Index) của bạn trên cây SMT. Nó không còn là 0x... nữa, mà là một số nguyên lớn (Field Element) để toán học trong ZK có thể "nhai" được một cách dễ dàng nhất.

## Hệ mật mã ZK-friendly (Thân thiện với ZK) dùng riêng bên trong L2/Rollup:

- Đường cong (Curve): Thay vì dùng `secp256k1` như Bitcoin/Ethereum, Rollup này dùng đường cong `BabyJubJub`. Nó được thiết kế toán học sao cho nằm lọt thỏm vừa vặn bên trong các smart contract của Ethereum, giúp việc verify trên L1 tốn cực ít Gas.
- Thuật toán Ký (Signature): Thay vì `ECDSA`, Rollup dùng `EdDSA`. Khóa công khai (Public Key) của user bây giờ không sinh ra địa chỉ 0x... nữa. Nó là một điểm trên đường cong `BabyJubJub`, gồm 2 tọa độ $(X, Y)$.
- Hàm Băm (Hash): Thay vì `Keccak256` hoặc `SHA256`, Rollup dùng `Poseidon`. Hàm băm được thiết kế dựa trên các phép cộng và nhân đại số đại cương ZK-friendly.

# Implement

Lưu ý, proof đưa lên L1 là chưa đủ, cần mô phỏng thêm việc đưa raw data lên L1 dưới dạng calldata, smart contract băm calldata và xác minh với public signal từ proof (chống rác in - rác out), và xác minh proof

## 0. CƠ CHẾ XÁC MINH DỮ LIỆU (CALLDATA + POSEIDON)

- **Nguyên tắc:** Dùng chung hàm băm Poseidon trên cả Circuit (L2) và Smart Contract (L1) để khóa dữ liệu.
- **Triển khai trên L1 (Mô phỏng contract bằng JS):**
    - Đọc dữ liệu giao dịch từ `msg.data` hoặc tham số hàm.
    - Thực hiện băm: `calculatedHash = Poseidon.hash(txData)`.
    - So sánh: `require(calculatedHash == publicInputHash, "Invalid DA")`.
- **Triển khai trên L2 (Circom):**
    - Trong mạch `BatchRollup`, dùng template `Poseidon` để băm toàn bộ TXs đầu vào.
    - Xuất kết quả ra `public signal` để Verifier có thể đọc được.
- **Ưu điểm:** Loại bỏ sự phức tạp của KZG Blob, dễ debug, đảm bảo "Rác in - Rác out" bị chặn đứng ở tầng Verifier.

## 1. Tự xác minh tài sản (Self-Verification)

- **Vấn đề:** newStateRoot trên Ethereum chỉ là một con số băm, user không biết số dư thực của mình.
- **Giải pháp:** - User (hoặc phần mềm ví) tải các "đống rác" (Blob/Calldata) từ Ethereum về.
    - Dựa trên logic của Rollup, ví tự chạy lại (re-play) các giao dịch để tính toán số dư mới của mình.
    - Ví lấy Merkle Path (được cung cấp bởi Sequencer hoặc tự dựng lại từ Blob) để băm thử lên Root.
    - Nếu kết quả băm khớp với `newStateRoot` trên L1 $\rightarrow$ Tin tưởng 100% số dư hiển thị là đúng mà không cần hỏi Sequencer.

## 2. Cánh cửa thoát hiểm (L1 Forced Withdrawal)

- **Vấn đề:** Nếu Sequencer (L2) bị sập, bị hack hoặc cố tình đóng băng tài khoản của Alice (censorship).
- **Giải pháp:** - Alice không cần xin phép L2. Cô ấy gửi một giao dịch trực tiếp lên Smart Contract trên Ethereum L1 kèm theo: `Mã băm tài khoản (Address)`, `Số dư`, `Nonce` và `Merkle Proof` (lấy từ dữ liệu Blob lịch sử).
    - Smart Contract L1 thực hiện phép băm: `Poseidon(Alice_Data, Merkle_Proof)`.
    - Nếu kết quả đúng bằng `stateRoot` hiện tại đang lưu trên L1 $\rightarrow$ L1 xác nhận Alice nói thật và cho phép cô ấy rút tiền thẳng về ví L1.
    - **Kết luận:** Dữ liệu Blob là "bảo hiểm" để user luôn có thể tự tạo Merkle Proof mà không phụ thuộc vào Sequencer.

# LOGIC XỬ LÝ PHÍ (TRANSACTION FEE)

- **Vị trí Sequencer:** Sequencer phải có một Account cố định trên cây SMT.
- **Cơ chế Cộng phí (Tối ưu):**
    - KHÔNG cộng phí ngay trong từng giao dịch (để tiết kiệm constraints).
    - Tạo một biến signal `totalBatchFee` để cộng dồn phí của toàn bộ `N_TXS`.
    - Thực hiện **01 lần cập nhật duy nhất** cho lá của Sequencer ở cuối mạch `BatchRollup`.
- **Ràng buộc bảo mật (Constraints):**
    - Phải chứng minh `totalBatchFee` là tổng chính xác của tất cả `tx.fee` trong batch.
    - Phải verify Merkle Proof cho Sequencer Account tại trạng thái cuối cùng của cây.
- **Ví Sequencer:** Là một Public Key (BabyJubJub) cố định. Số tiền phí này sau đó có thể được Sequencer rút ngược về L1 qua cơ chế Withdrawal thông thường.

## Update: Input của Sequencer (Fee Collector)

- **Trạng thái:** BẮT BUỘC phải là **Public Input** (để Ethereum kiểm soát).
- **Dữ liệu truyền vào mạch (Public):**
    - `operator_pub_key[2]`: Tọa độ X, Y của Sequencer.
- **Dữ liệu truyền vào mạch (Private - Witness):**
    - `seq_balance_old`: Số dư cũ của Sequencer.
    - `seq_nonce`: Nonce cũ của Sequencer.
    - `merkle_proof_seq`: Chứng minh lá của Sequencer tồn tại trên `oldStateRoot`.
- **Logic xác thực trong mạch:**
    1. Kiểm tra: `AccountLeaf(operator_pub_key, seq_balance_old, seq_nonce) == leaf_tại_vị_trí_đã_định`.
    2. Cộng phí: `seq_balance_new <== seq_balance_old + totalBatchFee`.
    3. Cập nhật Merkle Tree để ra `newStateRoot`.
