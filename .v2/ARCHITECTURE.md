# L1/L2 v2 Refactored Architecture

## Overview

The L1 and L2 servers have been refactored from a traditional Express route-based architecture to a **Service-based RPC architecture** following the pattern established in the `.v2/archive` implementation.

## Architecture Pattern

### Layers

1. **Public Service Interfaces** (`.v2/L{1,2}/services/public/*.js`)
   - Abstract service definitions extending `ServiceInterface`
   - Define method signatures and JSDoc documentation
   - Located in `services/public/` directory

2. **Service Implementations** (`.v2/L{1,2}/services/*ServiceImp.js`)
   - Concrete implementations extending `useContext(ServiceInterface)`
   - Access to HTTP request/response context via `this.context`
   - Business logic with database layer calls

3. **Database Layer** (`.v2/L{1,2}/db/index.js`)
   - Pure utility functions for database operations
   - No HTTP or Express dependencies
   - Handles read/write and state transformations

4. **RPC Routing** (`.v2/L{1,2}/server.js`)
   - Express middleware using `rpcService()` from shared lite_rpc
   - Automatic method exposure based on service interface
   - JSON-RPC 2.0 style calls via POST requests

## L1 Services

### DepositService
- `deposit(l1_address, amount, l2_pub_x, l2_pub_y)` - Create a deposit event
- `getPendingDeposits()` - Retrieve pending deposits for L2 to sync

### BatchService
- `submitBatch(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits)` - Verify and accept batch from L2

### WithdrawService
- `withdraw(l1_address, amount, batch_id, tx_data, merkle_proof)` - Process withdrawal with Merkle proof

### StateService
- `getState()` - Query current L1 bridge state

## L2 Services

### TransferService
- `transfer(tx_type, from_x, from_y, to_x, to_y, amount, fee, nonce, l1_address, sig_R8x, sig_R8y, sig_S)` - Process L2 transfer with EdDSA signature

### SyncService
- `syncDeposits()` - Fetch pending deposits from L1 and apply to L2 state

### BatchService
- `submitProof(proof, publicSignals, oldStateRoot, newStateRoot, daRoot, num_deposits, transactions)` - Submit batch to L1 and Archive

### StateService
- `getState()` - Query current L2 state (accounts, system, transactions)

## Separation of Concerns

### Before (Route-based)
```
HTTP Request → Express Route Handler → Database I/O + Business Logic → HTTP Response
```

### After (Service-based)
```
HTTP Request → RPC Middleware → Service Implementation → Database Layer → HTTP Response
                                      ↓
                                   Context (req, res)
```

**Benefits:**
- Services are testable independent of HTTP
- Clear separation between RPC transport and business logic
- Database functions are reusable
- Easy to add new service implementations or transports
- Consistent with archive service pattern

## RPC Call Format

All services are accessed via POST requests with JSON-RPC format:

```javascript
{
  "path": ["methodName"],
  "args": [arg1, arg2, ...]
}
```

### Example: Transfer on L2

```bash
curl -X POST http://localhost:5000/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "path": ["transfer"],
    "args": [0, "pubX", "pubY", "recvX", "recvY", "100", "1", "0", "0xL1Addr", "R8x", "R8y", "S"]
  }'
```

## File Structure

```
.v2/
├── L1/
│   ├── db/
│   │   └── index.js              # Database utility functions
│   ├── services/
│   │   ├── DepositServiceImp.js
│   │   ├── BatchServiceImp.js
│   │   ├── WithdrawServiceImp.js
│   │   ├── StateServiceImp.js
│   │   └── public/
│   │       ├── DepositService.js
│   │       ├── BatchService.js
│   │       ├── WithdrawService.js
│   │       └── StateService.js
│   ├── public/                   # Static UI files (placeholder)
│   └── server.js                 # Express app with RPC routing
├── L2/
│   ├── db/
│   │   └── index.js              # Database utility functions
│   ├── services/
│   │   ├── TransferServiceImp.js
│   │   ├── SyncServiceImp.js
│   │   ├── BatchServiceImp.js
│   │   ├── StateServiceImp.js
│   │   └── public/
│   │       ├── TransferService.js
│   │       ├── SyncService.js
│   │       ├── BatchService.js
│   │       └── StateService.js
│   ├── public/                   # Static UI files (placeholder)
│   └── server.js                 # Express app with RPC routing
├── archive/                      # Reference implementation
│   ├── db/
│   │   └── index.js
│   ├── services/
│   │   ├── ArchiveBlobServiceImp.js
│   │   └── public/
│   │       └── ArchiveBlobService.js
│   └── server.js
└── .shared/
    └── lite_rpc/
        ├── server.js             # RPC framework (rpcService, useContext)
        └── public/
            └── shared.js         # ServiceInterface base class
```

## Migration Notes

### For Future Development

1. **Database paths**: The services reference the original database files:
   - L1: Uses `../../L1/db/l1_db.json` (original location)
   - L2: Uses `../../L2/db/l2_db.json` (original location)

2. **Library imports**: Services import verification/crypto functions from original locations:
   - L1: `../../L1/lib/{plonk_verify,merkle_verify}.js`
   - L2: `../../L2/lib/eddsa.js`, `../../tools/{poseidon,merkle_tree}.js`

3. **Static files**: Public UI directories are placeholders. Copy actual UI files as needed.

### Running v2 Services

```bash
# L1 v2 Server (Port 3000)
node .v2/L1/server.js

# L2 v2 Server (Port 5000)
node .v2/L2/server.js

# Archive v2 Server (Port 4000) - already implemented
node .v2/archive/server.js
```

## Key Improvements

1. **Testability**: Services can be unit tested independently of Express
2. **Reusability**: Database functions are pure and composable
3. **Consistency**: Follows the established `.v2/archive` pattern
4. **Maintainability**: Clear separation between concerns
5. **Extensibility**: Easy to add new transport layers (gRPC, WebSockets, etc.)
