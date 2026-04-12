### Mạch số 1: [account_leaf.circom](./account_leaf.circom)

Trong zk-Rollup, hàng triệu tài khoản không được lưu trực tiếp trên L1 (Ethereum) mà được tổ chức thành một [Merkle tree](https://en.wikipedia.org/wiki/Merkle_tree) (Hay đúng hơn là sparse merkle tree). Cây này chỉ chứa các mã băm.
Mạch `account_leaf` có nhiệm vụ: Nén toàn bộ thông tin của một người dùng thành một mã băm duy nhất để nhét vào tầng thấp nhất (Lá) của cây Merkle. Mục tiêu là tính toàn vẹn.
