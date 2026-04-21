import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { rpcService } from '../../.shared/lite_rpc/server.js';
import { initL2DB } from './db/index.js';
import TransferServiceImp from './services/TransferServiceImp.js';
import SyncServiceImp from './services/SyncServiceImp.js';
import BatchServiceImp from './services/BatchServiceImp.js';
import StateServiceImp from './services/StateServiceImp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (UI)
app.use(express.static(path.join(__dirname, 'public')));

// RPC Services Routing
// Transfer Service
app.use('/transfer', rpcService(TransferServiceImp));
// Sync Service
app.use('/sync', rpcService(SyncServiceImp));
// Batch Service
app.use('/batch', rpcService(BatchServiceImp));
// State Service
app.use('/state', rpcService(StateServiceImp));

const PORT = 5000;

// Initialize database and start server
(async () => {
	try {
		await initL2DB();

		app.listen(PORT, () => {
			console.log(`[L2 Server v2] Sequencer running on http://localhost:${PORT}`);
			console.log(`[L2 Server v2] RPC Services available at http://localhost:${PORT}/{transfer,sync,batch,state}`);

			// Background polling daemon to sync deposits from L1 automatically
			setInterval(async () => {
				try {
					await fetch(`http://localhost:${PORT}/sync`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ path: ['syncDeposits'], args: [] }),
					});
				} catch (e) {
					// Silently fail if server is busy or restarting
				}
			}, 5000);
		});
	} catch (error) {
		console.error('[L2 Server] Failed to initialize database:', error);
		process.exit(1);
	}
})();
