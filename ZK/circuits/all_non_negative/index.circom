pragma circom 2.1.6;

// Import comparator để so sánh số nguyên >=
include "../../circomlib/circuits/comparators.circom";

// Template kiểm tra toàn bộ số dư người dùng đều không âm
template AllNonNegative(n) {
    // Mảng input users: mỗi phần tử gồm [user_id, balance]
    signal input users[n][2];

    // Output: 1 nếu tất cả user đều có balance >= 0, ngược lại là 0
    signal output allNonNegative; 

    // Mỗi user sẽ có một mạch GreaterEqThan để kiểm tra balance >= 0
    component isPositive[n];
    signal validFlags[n];

    for (var i = 0; i < n; i++) {
        // Khởi tạo mạch so sánh 64-bit
        isPositive[i] = GreaterEqThan(64);

        // So sánh users[i][1] (balance) >= 0
        isPositive[i].in[0] <== users[i][1]; // balance
        isPositive[i].in[1] <== 0;

        // Kết quả so sánh: 1 nếu balance >= 0, ngược lại 0
        validFlags[i] <== isPositive[i].out;
    }

    // Tính tích của tất cả validFlags để kiểm tra toàn bộ điều kiện
    signal products[n];

    // Khởi tạo tích ban đầu
    products[0] <== validFlags[0];

    for (var i = 1; i < n; i++) {
        // Nhân dồn để đảm bảo tất cả đều bằng 1 mới cho kết quả 1
        products[i] <== products[i - 1] * validFlags[i];
        log("Test circuit log:", products[i]);
    }

    // Output = 1 nếu toàn bộ balance đều >= 0
    allNonNegative <== products[n - 1];
}

// Demo: mạch chính kiểm tra 5 user
component main = AllNonNegative(5);