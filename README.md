# ZK-Rollup Simulator (Proof of Concept V1)

Dự án này là một bản mô phỏng đầy đủ (End-to-End) của kiến trúc ZK-Rollup, bao gồm Smart Contract (L1), Sequencer (L2), Archive Node (DA Layer) và mạch ZK-SNARK (Plonk). Hệ thống triển khai các luồng hoạt động cốt lõi như Nạp tiền (Deposit), Chuyển tiền Soft-Finality (Transfer) và Rút tiền thủ công qua Merkle Proof (Manual Claim Withdraw) với mô hình **Trustless Data Availability (EIP-4844)**.

---

## Nhược điểm Thiết Kế Hiện Tại (Gas Inefficiency)

Mục đích chính của ZK-Rollup là chuyển toàn bộ gánh nặng tính toán và lưu trữ rời khỏi L1 (Off-chain) để tiết kiệm phí Gas. Tuy nhiên, trong phiên bản V1 này, kiến trúc Database của Smart Contract L1 (`L1/db/l1_db.json`) đang tồn tại cấu trúc lưu trữ sai nguyên tắc tối ưu:

1. **Lưu trữ toàn bộ `batch_history` trên L1**:
    - Hiện tại, mỗi khi thả một Batch mới, hệ thống đang `Push` thêm một Object (gồm `state_root`, `da_root`, `timestamp`) vào mảng Lịch sử Lô (Batch History) trên Smart Contract.
    - **Vấn đề**: Thao tác `SSTORE` (Lưu data vĩnh viễn trên Storage Ethereum) tốn 20,000 Gas cho mỗi slot. Lưu mảng dài kỳ khiến tốn kém Gas vượt xa cả giới hạn phí giao dịch L1 thông thường, triệt tiêu hoàn toàn lợi ích kinh tế của L2.

2. **Lưu trữ toàn bộ hàng đợi `pending_deposits` trên L1**:
    - Mọi khoản tiền gửi vào (Deposit) hiện đang được nối đuôi vào một mảng sự kiện (`Array`) để chờ Sequencer L2 bốc đi.
    - **Vấn đề**: Giống hệt Batch History, việc mở rộng mảng này làm đội phí Gas Storage của User nạp tiền lên gấp hàng chục lần so với gửi ERC-20 bình thường.

3. **Sai lệch Kiến Trúc Storage của EVM và Dữ liệu Mô Phỏng**:
    - Hệ thống mô phỏng (PoC) hiện tại quản lý toàn bộ L1 bằng một cụm Object JSON phẳng (`l1_db.json`). Cấu trúc này không phản ánh chân thực thiết kế cấp thấp của Smart Contract trên Ethereum (EVM).
    - **Vấn đề**: Thứ nhất, EVM Storage thực chất là một chuỗi các khe (Slot) 256-bit lưu trữ số nguyên, trong khi DB hiện tại lưu dưới dạng Nested JSON Objects (Tạo ảo giác về bộ nhớ động rẻ mạt). Thứ hai, hệ thống chưa tách biệt mảng **Dữ liệu Mô Phỏng Môi Trường L1** (Ví dụ: Số dư `vault` của mạng lưới Ethereum) với **Storage Cục Bộ** của riêng cái Smart Contract đó (`bridge_contract`). Sự lẫn lộn này dẫn đến việc khó phỏng đoán chính xác cấu trúc EVM Storage Tree (State Trie) khi compile sang Solidity.

---

## Định hướng Phát triển (V2 - Hash Commitments)

### 1. Xóa bỏ Mảng `batch_history` -> Dùng "Rolling Hash" (Hoặc Merkle tree)

- L1 Smart Contract **không lưu mảng Batch**. Thay vào đó, L1 chỉ nên lưu duy nhất 1 biến Hash cuối cùng (Ví dụ: `history_root = Hash(old_history_root, new_batch.da_root, new_batch.state_root)`).
- Khi User muốn rút tiền từ một Batch cũ, User không chỉ nộp Merkle Proof của Giao dịch trong Batch, mà phải nộp kèm **Historical Merkle Proof** chứng minh rằng cái `da_root` của Batch đó có thuộc sự quản lý của cái `history_root` mã hóa trên L1 hay không. Trả lại việc tính toán lưu trữ History về tay người dùng off-chain.

### 2. Xóa bỏ Mảng `pending_deposits` -> Dùng "Accumulator Hash" (Deposit Tree)

- L1 không lưu mảng thông tin Deposit. Mỗi khi có sự kiện Deposit, L1 chỉ tính trực tiếp `current_deposit_hash = Hash(current_deposit_hash, new_deposit_data)` rồi lưu lại con số băm duy nhất này, chèn thêm Event Logs (EVM Logs) để Sequencer tải.
- EVM Logs (phát ra qua `emit Event`) rẻ hơn hàng chục lần so với lưu trữ `SSTORE`. Mạch ZK sẽ tự động thu thập (Accumulate) các Hash rời rạc đó và xác minh thẳng hàng (Operations Hash gốc).

Hai thay đổi này tuy đòi hỏi thay đổi Mạch ZK và Schema DB, nhưng sẽ kéo phí Gas duy trì L1 của Rollup giảm (Không bị scale theo N).

### 3. Chuẩn hóa Cấu trúc Dữ liệu L1 (Tách biệt Storage & Simulation)

- **Phân ranh giới Ngữ cảnh (Context Separation):** Trong phiên bản sau, cấu trúc File giả lập cần được chia ra hai không gian độc lập: `Blockchain_Environment` (bao gồm `vault` chứa Balance tài khoản L1, đóng vai trò như Ledger hệ thống) và `Contract_Storage` (Nơi chỉ chứa duy nhất State của Smart Contract rỗng, lưu trữ đè khít các Slot 256-bit).
