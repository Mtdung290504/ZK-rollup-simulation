import express from 'express';
import cors from 'cors';

import depositRoutes from './routes/deposit.js';
import batchRoutes from './routes/batch.js';
import withdrawRoutes from './routes/withdraw.js';
import stateRoutes from './routes/state.js';
import uiHelperRoutes from './routes/ui_helper.js';

import { staticDir } from '../utils.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/', staticDir('./public', import.meta.url));

app.use('/contract', depositRoutes);
app.use('/contract', batchRoutes);
app.use('/contract', withdrawRoutes);
app.use('/contract', stateRoutes);
app.use('/contract/ui', uiHelperRoutes);

const PORT = 3000;
app.listen(PORT, () => console.log(`[L1 Server] L1 Smart Contract running on http://localhost:${PORT}`));
