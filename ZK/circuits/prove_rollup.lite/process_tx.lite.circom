pragma circom 2.1.0;

include "../../circomlib/circuits/bitify.circom";
include "../../circomlib/circuits/comparators.circom";

template ProcessTxLite() {
    signal input from_addr;
    signal input to_addr;
    signal input amount;
    signal input fee;
    signal input sender_balance_before;

    signal output sender_balance_after;
    signal output amount_transferred;
    signal output fee_collected;

    // 1. Range check 32-bit cho an toàn (Chống số âm giả)
    component amtCheck = Num2Bits(32);
    amtCheck.in <== amount;

    // 2. Kiểm tra đủ tiền: balance >= amount + fee
    component geq = GreaterEqThan(32);
    geq.in[0] <== sender_balance_before;
    geq.in[1] <== amount + fee;
    geq.out === 1;

    // 3. Tính toán số dư sau giao dịch
    sender_balance_after <== sender_balance_before - amount - fee;
    
    // Output để mạch chính cộng dồn
    amount_transferred <== amount;
    fee_collected <== fee;
}