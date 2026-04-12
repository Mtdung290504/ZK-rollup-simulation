pragma circom 2.1.0;

include "../../circomlib/circuits/poseidon.circom";

// Tối ưu: Dùng chung Path Elements để tính Root cũ và mới song song
template MerkleTreeUpdater(DEPTH) {
    // 1. Đầu vào:
    // Lá cũ, Lá mới, Các nút anh em (Elements), Trái/Phải (Indices)
    signal input leaf_old;
    signal input leaf_new;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // 2. Đầu ra: Gốc cũ và Gốc mới
    signal output root_old;
    signal output root_new;

    // Mảng lưu trữ các giá trị hash trong quá trình tính toán
    signal hashes_old[DEPTH + 1];
    signal hashes_new[DEPTH + 1];

    // Khởi tạo: Gán giá trị lá vào vị trí đầu tiên của mảng
    hashes_old[0] <== leaf_old;
    hashes_new[0] <== leaf_new;

    component poseidons_old[DEPTH];
    component poseidons_new[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        // 1. Ràng buộc 0/1 duy nhất một lần cho mỗi tầng
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // 2. Logic chọn Trái/Phải cho cả Cũ và Mới (Dùng chung pathIndices)
        // Result = A + Index * (B - A)
        // Nếu pathIndices[i] == 0: L = hash, R = sibling
        // Nếu pathIndices[i] == 1: L = sibling, R = hash
        // Rườm rà vậy là do cái này không có if/else
        
        poseidons_old[i] = Poseidon(2);
        poseidons_old[i].inputs[0] <== hashes_old[i] + pathIndices[i] * (pathElements[i] - hashes_old[i]);
        poseidons_old[i].inputs[1] <== pathElements[i] + pathIndices[i] * (hashes_old[i] - pathElements[i]);
        hashes_old[i + 1] <== poseidons_old[i].out;

        poseidons_new[i] = Poseidon(2);
        poseidons_new[i].inputs[0] <== hashes_new[i] + pathIndices[i] * (pathElements[i] - hashes_new[i]);
        poseidons_new[i].inputs[1] <== pathElements[i] + pathIndices[i] * (hashes_new[i] - pathElements[i]);
        hashes_new[i + 1] <== poseidons_new[i].out;
    }

    root_old <== hashes_old[DEPTH];
    root_new <== hashes_new[DEPTH];
}