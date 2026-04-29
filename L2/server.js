import express from 'express';
import cors from 'cors';

import transferRoutes from './routes/transfer.js';
import syncRoutes from './routes/sync.js';
import batchRoutes from './routes/batch.js';
import stateRoutes from './routes/state.js';
import uiProxyRoutes from './routes/ui_helper.js';

import { staticDir } from '../utils.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', staticDir('./public', import.meta.url));

app.use('/l2', transferRoutes);
app.use('/l2', syncRoutes);
app.use('/l2', batchRoutes);
app.use('/l2', stateRoutes);
app.use('/l2/ui', uiProxyRoutes);

const PORT = 5000;
app.listen(PORT, () => {
	console.log(`[L2 Server] Sequencer running on http://localhost:${PORT}`);

	// Background polling daemon to sync deposits from L1 automatically
	setInterval(async () => {
		try {
			await fetch(`http://localhost:${PORT}/l2/sync-deposits`);
		} catch (e) {
			// Silently fail if server is busy or restarting
		}
	}, 5000);
});
