import express from 'express';
import cors from 'cors';

import { rpcService } from '../.shared/lite_rpc/server.js';
import ArchiveBlobServiceImp from './services/ArchiveBlobServiceImp.js';

const app = express();
app.use(cors());
app.use('/', rpcService(ArchiveBlobServiceImp));

const PORT = 4000;
app.listen(PORT, () => console.log(`[Archive Node] Data Availability Server running on http://localhost:${PORT}`));
