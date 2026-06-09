# ZK-Rollup Simulator (PoC V1)

A proof-of-concept simulation of ZK-Rollup architecture. The system handles the basic transaction flow — deposit, internal transfer, and withdrawal — using a Sparse Merkle Tree, EdDSA signatures, and PLONK proofs via Circom/SnarkJS.

## Documentation

- [System Design V1](.des/v1/.system-design.md) — data flow, security invariants, API reference
- [ZK Circuit Spec](ZK/circuits/prove_rollup/.readme.md) — Circom constraints breakdown
- [Proving Environment](ZK/README.md) — Circom/SnarkJS setup and proof generation scripts

---

## Architecture

Four components communicating over HTTP/JSON:

| Component | Port | Role |
|---|---|---|
| L1 Server | 3000 | Smart contract simulation (Vault, ZK verifier, deposit queue) + L1 Explorer UI |
| L2 Server | 5000 | Sequencer (mempool, state, batch relay) + L2 Web Wallet UI |
| Archive Node | 4000 | Stores DA blobs; provides transaction data for withdrawal Merkle proofs |

**Treasury model:** L2 has a special Treasury account (`balance = MAX_UINT128`). Every deposit is `Treasury → User`; every withdrawal is `User → Treasury`. No minting — total supply is constant.

---

## Known Limitations (V1)

1. **`batch_history` stored on-chain** — grows without bound. On real EVM, each batch write costs ~20,000 gas/slot.
2. **`pending_deposits` stored on-chain** — same issue; production systems use event logs instead.
3. **JSON ≠ EVM slot model** — the 256-bit slot storage layout is not faithfully simulated.

## V2 Roadmap

- Replace `batch_history` with a rolling hash (historical Merkle proof for withdrawals)
- Replace `pending_deposits` with an accumulator hash + EVM event logs
- Accurate EVM 256-bit slot storage simulation
