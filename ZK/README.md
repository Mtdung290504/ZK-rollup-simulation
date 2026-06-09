# ZK Circuit — Setup and Proving Environment

## Requirements

**All platforms:**
- `git`
- `circom` (added to PATH)
- `Node.js`, `npm`, `npx`
- `snarkjs` installed globally (`npm install -g snarkjs`)

**Windows:** Follow the setup guide at the [Google Docs walkthrough](https://docs.google.com/document/d/1e6rXiNfLfY0tyGLNRCeN4jCv5qX2kDYzorYolOLc7ZY/edit?tab=t.m53yszyif1vt#heading=h.d97jf1b071bh).

> CLI argument syntax may differ on Linux/macOS — scripts may need adjustment.

**Clone circomlib** into the project (or anywhere with a valid include path):

```bash
git clone https://github.com/iden3/circomlib.git
```

## Powers of Tau

The proving script auto-detects the required constraint count and downloads the matching PTAU file from the Hermez repository. **Internet access is required on the first run.**

- Files are cached in `prove/powers_of_tau/`
- File naming: `_k.ptau` supports circuits with up to 2^k constraints
- Current circuit (N_TXS=4, DEPTH=4): k≈10–15, file size 2–36 MB
- You can pre-download from the [SnarkJS PTAU index](https://github.com/iden3/snarkjs#7-prepare-phase-2) to avoid network dependency

**Working directory:** The prove script resolves paths from `process.cwd()`, so run it from the project root.

---

## Testing a Circuit

Each circuit lives in its own subdirectory under `circuits/` and needs two files:

- `index.circom` — the main circuit template
- `input.json` — witness inputs (plain JSON, no comments)

**Run (from project root):**

```bash
# PLONK (default)
node .\prove\ .\circuits\<circuit-dir>\

# Groth16
node .\prove\ .\circuits\<circuit-dir>\ groth16
```

**Output** appears in `circuits/<circuit-dir>/output/`:

```
output/
  index.r1cs
  index_js/index.wasm
  witness.wtns
  plonk/            (or groth16/)
    proof.json
    public.json
    verification_key.json
    index_***.zkey
```

To verify a proof, share `proof.json`, `public.json`, and `verification_key.json` with the verifier. The circuit itself must also be public so the verifier can confirm the key was derived from it.
