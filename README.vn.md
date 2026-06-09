# ZK-Rollup Simulator (Proof of Concept V1)

Dự án này là một mô hình giả lập (Proof of Concept) kiến trúc ZK-Rollup. Hệ thống bao gồm các thành phần cơ bản: Smart Contract trên L1, Sequencer trên L2, Archive Node (đóng vai trò Data Availability), và mạch xác minh ZK-SNARK (sử dụng PLONK). Dự án mô phỏng luồng thực thi giao dịch cơ bản bao gồm nạp tiền, chuyển tiền nội bộ và rút tiền về L1 bằng Merkle Proof.

## Documentation

- [Thiết kế Hệ thống (System Design V1)](.des/v1/.system-design.vn.md): Mô tả luồng dữ liệu, bất biến bảo mật và API reference.
- [Đặc tả Mạch ZK-Rollup](ZK/circuits/prove_rollup/.readme.vn.md): Phân tích chi tiết các ràng buộc (constraints) của mạch Circom.
- [Môi trường và Công cụ Proving](ZK/README.vn.md): Hướng dẫn thiết lập Circom, SnarkJS và script tự động tạo Bằng chứng (Proof).

---

## Các hạn chế của thiết kế hiện tại (V1)

Mục tiêu cốt lõi của ZK-Rollup là dịch chuyển tính toán và lưu trữ ra khỏi L1 nhằm tối ưu hóa phí Gas. Tuy nhiên, kiến trúc lưu trữ của Smart Contract hiện tại (mô phỏng tại `L1/db/l1_db.json`) vẫn còn tồn tại các cấu trúc gây tốn kém phí Gas khi áp dụng vào môi trường thực tế:

1. **Lưu trữ toàn bộ `batch_history` trên L1**:
    - Mỗi khi L2 nộp một Batch mới, Smart Contract L1 sẽ thêm dữ liệu (state_root, da_root, timestamp) vào một mảng lưu trữ vĩnh viễn.
    - **Hạn chế**: Trên EVM, thao tác ghi dữ liệu (`SSTORE`) tiêu tốn chi phí rất lớn (20,000 Gas/slot). Việc liên tục mở rộng mảng lưu trữ này sẽ làm tăng phí vận hành mạng lưới theo thời gian, đi ngược lại nguyên lý tiết kiệm chi phí của L2.

2. **Lưu trữ toàn bộ hàng đợi `pending_deposits` trên L1**:
    - Khi có yêu cầu nạp tiền, Smart Contract L1 tiếp tục lưu trữ toàn bộ thông tin nạp tiền vào một mảng on-chain để chờ L2 xử lý.
    - **Hạn chế**: Tương tự như mảng `batch_history`, việc lưu trữ này làm phí nạp tiền của mạng lưới L1 tăng cao.

3. **Mô phỏng chưa phản ánh chính xác cấu trúc EVM Storage**:
    - Kiến trúc cơ sở dữ liệu giả lập của L1 hiện tại đang sử dụng cấu trúc JSON lồng nhau.
    - **Thực tế**: Storage của EVM là một tập hợp các khe bộ nhớ (slot) 256-bit. Sự thiếu nhất quán này sẽ gây khó khăn khi biên dịch lại logic sang ngôn ngữ Solidity.

---

## Định hướng cấu trúc cho phiên bản tiếp theo (V2)

### 1. Thay thế mảng `batch_history` bằng "Rolling Hash"

- L1 sẽ **không** lưu trữ toàn bộ mảng các Batch. Thay vào đó, L1 chỉ lưu trữ một giá trị Hash duy nhất đại diện cho toàn bộ lịch sử trạng thái (Ví dụ: `history_root = Hash(old_history_root, new_batch)`).
- Khi có yêu cầu rút tiền từ một Batch trong quá khứ, quy trình rút tiền sẽ yêu cầu nộp kèm một **Historical Merkle Proof** để chứng minh cấu trúc Batch đó hợp lệ với `history_root` đang được lưu trên L1. Việc tính toán và lưu trữ lịch sử hoàn toàn được thực hiện ở môi trường off-chain.

### 2. Thay thế mảng `pending_deposits` bằng "Accumulator Hash"

- Mảng nạp tiền cũng sẽ bị loại bỏ. L1 sẽ tính toán trực tiếp giá trị Hash của giao dịch nạp tiền gộp vào một Hash tổng (Accumulator Hash) và phát ra Event Log.
- Event Log trên EVM có chi phí rẻ hơn rất nhiều so với thao tác ghi Storage. Sequencer sẽ đọc dữ liệu từ các Event Log này, và mạch ZK sẽ chịu trách nhiệm xác minh tính chính xác của quá trình tổng hợp dữ liệu nạp tiền.

Thay đổi đề xuất giúp cố định phí duy trì L1, không bị tăng trưởng tuyến tính theo số lượng giao dịch, tuy nhiên sẽ yêu cầu thiết kế lại mạch ZK và hệ thống dữ liệu. Ngoài ra có thách thức về race condition khi chỉ dùng đúng 1 rolling hash. Hiện chưa có giải pháp hiệu quả ngoài lưu nhiều rolling hash. Tuy nhiên việc này sẽ làm tăng phí L1. Có thể cân nhắc sử dụng một số lượng storage trong phạm vi nào đó. Xóa bớt những cái ở quá xa. Thay đổi cơ chế rút tiền thành chủ động rút và trả về L1 từ L1 từ đó không cần lưu batch history để truy vấn nữa.

### 3. Mô phỏng tốt hơn cấu trúc dữ liệu Storage của EVM

- `Contract_Storage` (chỉ chứa dữ liệu biến số trạng thái của Smart Contract, mô phỏng chính xác cấu trúc lưu trữ 256-bit).
