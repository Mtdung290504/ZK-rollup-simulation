# ZK-Rollup Simulation App — Hướng dẫn sử dụng

## Các bước khởi chạy hệ thống

### Bước 1: Khởi tạo (Chạy 1 lần)

```sh
# Cài đặt thư viện Node.js cần thiết (Express, CircomlibJS, Ethers, Snarkjs)
npm install

# Sinh cặp khóa (L1 + L2) cho Alice, Bob, Operator, Treasury
node tools/wallet_generator.js

# Tạo dữ liệu State ban đầu (L1 Vault và L2 Merkle Tree)
node tools/init_db.js
```

### Bước 2: Khởi động Servers

Mở 3 Terminal (Powershell/BASH) khác nhau để duy trì cụm Mạng:

```sh
node L1/server.js       # Phục vụ Smart Contract Ethereum & L1 Explorer
node L2/server.js       # Phục vụ Sequencer Mempool & L2 Web Wallet
node archive/server.js  # Phục vụ Archive Node lưu Data Availability (DA blobs)
```

### Bước 3: Kịch bản thử nghiệm qua Giao diện Web (UI)

Hệ thống được trang bị 2 Dashboard trực quan. Mở trình duyệt:

**1. L1 Explorer và Bridge (`http://localhost:3000`)**
Tại đây, tham số mạng ZK tự động cập nhật Real-time. Bạn có thể Nạp/Rút tương tác với hợp đồng:

- **Deposit (Nạp tiền xuống L2)**: Dán địa chỉ ví L1 của bạn và 2 đoạn khoá **Receiver L2 PubKey X, Y** (Lấy trong đoạn khai báo L2 ở file `config/wallets.json`) sau đó nhập số lượng ETH rồi bấm "Bridge to L2". Giao dịch sẽ đẩy xuống Queue. Sequencer của L2 lập tức nhặt Lệnh nạp tiền này, quét tìm PubKey và tự động **Onboard (Tạo thẻ Account mới)** vào cây nếu ví chưa từng tồn tại trên L2!
- **Withdraw (Rút ETH về L1)**: Sau khi đóng lô (xem Bước 4) và có Batch. Hãy điền L1 Address, ID của Batch (VD: 1), và TX Index (Vị trí giao dịch rút tiền trong lô, VD: 0, 1 hoặc 2) bấm Claim. Hệ thống đằng sau tự tạo DA Merkle Proof đệ trình lên Contract L1 để nhả tiền Lock về số dư.

**2. L2 Web Wallet (`http://localhost:5000`)**
Mở file `config/wallets.json` ra để lấy Private Key và PublicKey nhúng vào Web:

- **Lưu Khóa**: Sang Tab **🔑 Keystore Manager**. Nhập mã `privateKey` của người gửi, bấm "Save to LocalStorage". Nó đóng vai trò Wallet Connect EdDSA Signer trực tiếp trên trình duyệt.
- **Chuyển tiền nội / Rút tiền (Transfer/Withdraw)**: Sang Tab **📤 Send TX**.
    - Muốn chuyển nội bộ: Copy 2 chiều PublicKey X và Y của Bob dán vào mục Receiver.
    - Muốn rút tiền: Copy 2 PK của **Treasury Account** dán vào mục Receiver.
      Bấm Send, khoản tiền L2 sẽ rơi vào Mempool ảo (Soft-Finality) chờ Sequencer nhặt để chứng minh.

### Bước 4: Chốt Sổ Giao Dịch (Role Thợ Đào / Sequencer / Operator)

Việc tạo Bằng Chứng ZK (Proofing Process) là tác vụ cực nặng và thường làm ngầm ở Server Backend. Để thúc đẩy lô bằng chứng, hãy chạy lệnh sau ở 1 Terminal bên ngoài:

```sh
node tools/batch_prove.js
```

Ngay khi Plonk sinh Proof thành công và báo cáo Call Data API lên L1. Hãy sang cửa sổ L1 Explorer `http://localhost:3000` để chứng kiến State Root chuyển dời, hoàn thiện vòng lặp (Hard-Finality).
