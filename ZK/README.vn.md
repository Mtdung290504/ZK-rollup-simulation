# Quy trình setup và mô tả công nghệ lõi của dự án

## Chuẩn bị môi trường

### Yêu cầu quan trọng:

**1. Setup môi trường cơ bản:**

- Setup môi trường theo hướng dẫn tại: [Tài liệu hướng dẫn](https://docs.google.com/document/d/1e6rXiNfLfY0tyGLNRCeN4jCv5qX2kDYzorYolOLc7ZY/edit?tab=t.m53yszyif1vt#heading=h.d97jf1b071bh)
    - Lưu ý rằng tài liệu trên hỗ trợ chính cho Windows. Trên Linux hay MacOS, cần cài đặt các môi trường sau:
        - `git`
        - `circom` (thêm vào biến môi trường)
        - `Node.js`, `npm`, `npx`
        - Cài đặt `snarkjs` đặt global
    - Chú ý: Script có thể chạy sai trên các HĐH khác nếu cú pháp lệnh CLI truyền tham số có sự khác biệt nhỏ.
- Clone thư viện `circomlib` vào thư mục chứa mạch (hoặc để bất kì đâu trong dự án, miễn là trỏ include `.circom` chuẩn xác):
    ```bash
    git clone https://github.com/iden3/circomlib.git
    ```

**2. Về kết nối mạng và thiết lập Powers of Tau:**

- **Cần có mạng internet trong những lần đầu** khi chạy để hệ thống tự động nhận diện và tải các file Powers of Tau (PTAU) từ kho lưu trữ phân tán.
- **Khi có mạng**: Script sẽ tự động tính toán cấu trúc (bóc r1cs) của mạch và tải về đúng file Powers of Tau tối ưu từ Hermez.
- **Vị trí file**: Các file PTAU tải về được lưu tại `prove/powers_of_tau/`
- **Quy tắc đặt tên**: Chỉ số `k` cuối tên file (VD: `_15.ptau`) cho biết nó chỉ dùng được cho mạch có tối đa $2^k$ constraints.
- **Kích thước file**:
    - Mạch cực lớn (k=32): file có thể lên đến 9GB.
    - Mạch demo hiện tại (k≈10 đến k≈15): dung lượng từ 2MB đến 36MB, thời gian tải thường diễn ra tức thời qua hệ thống script.
- **Tải trước**: Có thể chủ động tải file `powers_of_tau` từ [kho SnarkJS Github](https://github.com/iden3/snarkjs#7-prepare-phase-2) trực tiếp vào thư mục `prove/powers_of_tau/` để dự phòng trường hợp mạng không ổn định làm đứt lệnh script.

**3. Thư mục làm việc:**

Script Proof lấy `process.cwd()` làm gốc tham chiếu đường dẫn nếu script được gọi dùng đường dẫn tương đối.

---

## Hướng dẫn test mạch Circom

### Chuẩn bị file:

1. Tạo một thư mục con trong `circuits/` (ví dụ: `circuits/all_non_negative/`)
2. Trong thư mục phân nhánh này bắt buộc phải có đủ 2 file cốt lõi:
    - File `index.circom`: Chứa logic/hàm mạch chính (Main Circuit).
    - File `input.json`: Chứa input signals kích hoạt mạch (định dạng JSON, không được comment).

### Chạy test sinh Bằng Chứng (Proof Generation):

Hỗ trợ chạy **PLONK** và **Groth16**.

Cú pháp:

```bash
node .\prove\ <đường_dẫn_đến_thư_mục_chứa_mạch> [plonk|groth16]
```

**Ví dụ chạy PLONK (Mặc định):**

```bash
node .\prove\ .\circuits\all_non_negative\
# Hoặc
node .\prove\ .\circuits\all_non_negative\ plonk
```

**Ví dụ chạy Groth16:**

```bash
node .\prove\ .\circuits\all_non_negative\ groth16
```

### Kết quả (Artifacts Component):

Sau khi nhận được tín hiệu Success từ Terminal, tại thư mục chứa mạch sẽ xuất hiện một folder `output/`.

- **Vị trí `output/`**:
    - `index.r1cs` và `.wasm`
    - `witness.wtns`
- **Vị trí `output/plonk/` hoặc `output/groth16/`**:
    - `proof.json`
    - `public.json`
    - `verification_key.json`
    - `index_***.zkey`

Trong đó: `proof.json`, `public.json` và `verification_key.json` là các file cung cấp cho verifier để xác minh bằng chứng.

Lưu ý: Cần công khai mạch để verifier xác minh verification_key đến từ chính mạch đã sinh ra bằng chứng.
