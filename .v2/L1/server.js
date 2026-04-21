import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { rpcService, staticDir } from '../../.shared/lite_rpc/server.js';
import { initL1DB } from './db/index.js';
import DepositServiceImp from './services/DepositServiceImp.js';
import BatchServiceImp from './services/BatchServiceImp.js';
import WithdrawServiceImp from './services/WithdrawServiceImp.js';
import StateServiceImp from './services/StateServiceImp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (UI)
app.use(express.static(path.join(__dirname, 'public')));

// RPC Services Routing
// Deposit Service
app.use('/deposit', rpcService(DepositServiceImp));
// Batch Service
app.use('/batch', rpcService(BatchServiceImp));
// Withdraw Service
app.use('/withdraw', rpcService(WithdrawServiceImp));
// State Service
app.use('/state', rpcService(StateServiceImp));

const PORT = 3000;

// Initialize database and start server
(async () => {
	try {
		await initL1DB();
		app.listen(PORT, () => {
			console.log(`[L1 Server v2] L1 Mock Smart Contract running on http://localhost:${PORT}`);
			console.log(`[L1 Server v2] RPC Services available at http://localhost:${PORT}/{deposit,batch,withdraw,state}`);
		});
	} catch (error) {
		console.error('[L1 Server] Failed to initialize database:', error);
		process.exit(1);
	}
})();
