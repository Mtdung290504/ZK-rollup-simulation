# v2 Refactored Services - Quick Reference

## Overview
The L1 and L2 implementations have been refactored from traditional Express routes to a **Service-based RPC architecture** pattern, following the `archive` reference implementation in `.v2/`.

## Key Changes

### Before (Original L1/L2)
- Express routes directly handling HTTP requests
- Business logic mixed with route handlers
- Database operations inline with HTTP code

### After (v2 Refactored)
- Clean **Service Interfaces** (abstract, self-documenting)
- **Service Implementations** with proper separation of concerns
- **Database Layer** with pure utility functions
- **RPC Framework** handling JSON-RPC 2.0 calls

## Folder Structure Created

```
.v2/
├── L1/
│   ├── db/index.js                          # Database utilities
│   ├── services/
│   │   ├── DepositServiceImp.js             # Implementation
│   │   ├── BatchServiceImp.js
│   │   ├── WithdrawServiceImp.js
│   │   ├── StateServiceImp.js
│   │   └── public/
│   │       ├── DepositService.js            # Interface
│   │       ├── BatchService.js
│   │       ├── WithdrawService.js
│   │       └── StateService.js
│   ├── public/                              # UI assets (placeholder)
│   └── server.js                            # RPC server
│
├── L2/
│   ├── db/index.js                          # Database utilities
│   ├── services/
│   │   ├── TransferServiceImp.js            # Implementation
│   │   ├── SyncServiceImp.js
│   │   ├── BatchServiceImp.js
│   │   ├── StateServiceImp.js
│   │   └── public/
│   │       ├── TransferService.js           # Interface
│   │       ├── SyncService.js
│   │       ├── BatchService.js
│   │       └── StateService.js
│   ├── public/                              # UI assets (placeholder)
│   └── server.js                            # RPC server
│
├── archive/                                 # Reference implementation
│   ├── db/index.js
│   ├── services/
│   │   ├── ArchiveBlobServiceImp.js
│   │   └── public/ArchiveBlobService.js
│   └── server.js
│
├── .shared/lite_rpc/                        # Shared RPC framework
│   ├── server.js                            # rpcService(), useContext()
│   └── public/shared.js                     # ServiceInterface base class
│
└── ARCHITECTURE.md                          # Full documentation
```

## Service Classes

### L1 Services

| Service | Methods | Purpose |
|---------|---------|---------|
| DepositService | `deposit()`, `getPendingDeposits()` | Lock ETH on L1 and track deposits |
| BatchService | `submitBatch()` | Verify ZK proof and update state |
| WithdrawService | `withdraw()` | Process withdrawals with Merkle proof |
| StateService | `getState()` | Query bridge state |

### L2 Services

| Service | Methods | Purpose |
|---------|---------|---------|
| TransferService | `transfer()` | Process L2 transfers with EdDSA signature |
| SyncService | `syncDeposits()` | Fetch deposits from L1 and apply to L2 |
| BatchService | `submitProof()` | Submit batch to L1 and Archive |
| StateService | `getState()` | Query L2 state |

## Database Layer Functions

### L1 (`.v2/L1/db/index.js`)
- `readDB()` / `writeDB()` - File I/O
- `addDeposit()` - Create deposit event
- `getPendingDeposits()` - Fetch pending deposits
- `submitBatch()` - Update batch state
- `commitWithdraw()` - Process withdrawal

### L2 (`.v2/L2/db/index.js`)
- `readDB()` / `writeDB()` - File I/O
- `addTransaction()` - Add transaction
- `updateBatchState()` - Update after batch submitted

## Usage Examples

### RPC Call Format
```json
{
  "path": ["methodName"],
  "args": [arg1, arg2, ...]
}
```

### L1 Deposit Example
```bash
curl -X POST http://localhost:3000/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "path": ["deposit"],
    "args": ["0xAlice", 10, "pubX", "pubY"]
  }'
```

### L2 Transfer Example
```bash
curl -X POST http://localhost:5000/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "path": ["transfer"],
    "args": [0, "fromX", "fromY", "toX", "toY", "5", "0.1", "0", "0xL1", "R8x", "R8y", "S"]
  }'
```

### L2 Sync Deposits
```bash
curl -X POST http://localhost:5000/sync \
  -H "Content-Type: application/json" \
  -d '{"path": ["syncDeposits"], "args": []}'
```

## Service Implementation Pattern

Each service follows this structure:

```javascript
// Service Interface (public/XxxService.js)
export default class XxxService extends ServiceInterface {
  xxx(arg1, arg2) { return this.abstract(); }
}

// Service Implementation (XxxServiceImp.js)
export default class XxxServiceImp extends useContext(XxxService) {
  xxx(arg1, arg2) {
    const { res } = this.context;  // Access HTTP context
    // Business logic + database calls
    return { result: ... };
  }
}

// Server routing (server.js)
app.use('/xxx', rpcService(XxxServiceImp));
```

## Important Notes

1. **Database Paths**: v2 services reference original database files
   - L1: `../../L1/db/l1_db.json`
   - L2: `../../L2/db/l2_db.json`

2. **Library Dependencies**: Services import from original locations
   - Verification: `../../L{1}/lib/{plonk_verify,merkle_verify}.js`
   - Crypto: `../../L2/lib/eddsa.js`, `../../tools/poseidon.js`

3. **Error Handling**: Services return error objects instead of throwing
   - Errors are JSON objects with `error` field
   - HTTP status codes set via `res.status()`

4. **Context Access**: Use `this.context.res` to set HTTP status/headers

## Advantages of v2 Architecture

✅ **Testability** - Services independent of HTTP  
✅ **Maintainability** - Clear separation of concerns  
✅ **Consistency** - Uniform pattern across all services  
✅ **Extensibility** - Easy to add new transports (gRPC, WebSockets)  
✅ **Reusability** - Database functions are composable  
✅ **Documentation** - JSDoc types for IDE autocomplete  

## Running v2 Services

```bash
# Terminal 1: L1 (Port 3000)
cd c:\ZKPs\ZK-rollup
node .v2/L1/server.js

# Terminal 2: L2 (Port 5000)
cd c:\ZKPs\ZK-rollup
node .v2/L2/server.js

# Terminal 3: Archive (Port 4000)
cd c:\ZKPs\ZK-rollup
node .v2/archive/server.js
```

## Next Steps

1. Copy actual UI files to `.v2/L1/public/` and `.v2/L2/public/`
2. Update client applications to use RPC format
3. Test all endpoints
4. Consider creating client library for RPC calls
5. Optionally migrate database files to `.v2/L{1,2}/db/`
