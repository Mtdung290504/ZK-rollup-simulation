import express from 'express';
import cors from 'cors';
import blobsRoutes from './routes/blobs.js';

const app = express();
app.use(cors());
// Need larger payload for DA blob
app.use(express.json({ limit: '50mb' }));

app.use('/archive', blobsRoutes);

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`[Archive Node] Data Availability Server running on http://localhost:${PORT}`);
});
