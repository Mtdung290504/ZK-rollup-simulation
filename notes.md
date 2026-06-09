# Quick Start

## 1. First-time Setup

```sh
npm install
node tools/wallet_generator.js   # Generate L1/L2 keypairs for Alice, Bob, Operator, Treasury
node tools/init_db.js            # Initialize L1 vault and L2 Merkle tree state
```

## 2. Start Servers

Open three terminals:

```sh
node L1/server.js      # L1 smart contract + explorer  →  http://localhost:3000
node L2/server.js      # L2 sequencer + web wallet     →  http://localhost:5000
node archive/server.js # Archive node (DA blob storage)
```

## 3. Using the UI

**L1 Explorer & Bridge** — `http://localhost:3000`

- **Deposit**: Enter your L1 address and the receiver's L2 public key (X and Y from `config/wallets.json`), then click "Bridge to L2". The L2 sequencer picks up the deposit event automatically on the next sync.
- **Withdraw**: After a batch is proven, enter your L1 address, the Batch ID, and the TX index within that batch, then click "Claim". The UI builds the DA Merkle proof and submits it to L1.

**L2 Web Wallet** — `http://localhost:5000`

- **Keystore**: Go to the Keystore Manager tab, paste your `privateKey` from `config/wallets.json`, and save to LocalStorage.
- **Transfer**: Enter the receiver's L2 public key X and Y. To withdraw, use the Treasury public key as the receiver.

## 4. Prove a Batch (Sequencer/Operator role)

```sh
node L2/tools/batch_prove.js
```

This generates a PLONK proof for the pending transaction batch, submits it to L1, and publishes the DA blob to the archive. The L1 state root updates to reflect the new proven state. Check `http://localhost:3000` to confirm.
