pragma circom 2.1.0;

include "process_tx.lite.circom";

template BatchRollupLite(N_TXS) {
    // Inputs của 200 TXs
    signal input txs_from[N_TXS];
    signal input txs_to[N_TXS];
    signal input txs_amount[N_TXS];
    signal input txs_fee[N_TXS];
    signal input sender_balances_before[N_TXS];

    // Thông tin Operator (Sequencer)
    signal input operator_balance_before;
    signal output operator_balance_after;

    // Public Output để verify trên L1
    signal output total_volume; // Tổng lượng tiền luân chuyển
    signal output final_batch_fee; // Tổng phí sequencer nhận được

    component processors[N_TXS];
    signal sum_amount[N_TXS + 1];
    signal sum_fee[N_TXS + 1];
    
    sum_amount[0] <== 0;
    sum_fee[0] <== 0;

    for (var i = 0; i < N_TXS; i++) {
        processors[i] = ProcessTxLite();
        processors[i].from_addr <== txs_from[i];
        processors[i].to_addr <== txs_to[i];
        processors[i].amount <== txs_amount[i];
        processors[i].fee <== txs_fee[i];
        processors[i].sender_balance_before <== sender_balances_before[i];

        // Cộng dồn thống kê
        sum_amount[i+1] <== sum_amount[i] + processors[i].amount_transferred;
        sum_fee[i+1] <== sum_fee[i] + processors[i].fee_collected;
    }

    // Cập nhật ví cho Operator
    operator_balance_after <== operator_balance_before + sum_fee[N_TXS];

    // Xuất thông tin ra Public
    total_volume <== sum_amount[N_TXS];
    final_batch_fee <== sum_fee[N_TXS];
}

component main = BatchRollupLite(100);