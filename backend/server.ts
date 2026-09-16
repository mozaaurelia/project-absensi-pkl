import app from './app';
import dotenv from 'dotenv';
import http from 'http';
import { startCronJobs } from './src/database/cronJobs';
import { syncSchema } from './src/database/schema';
import { initSocketServer } from './src/socket';

dotenv.config();

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
initSocketServer(server);

server.listen(PORT, async () => {
  try {
    await syncSchema();
  } catch (err) {
    console.error('[syncSchema] Error:', err);
  }
  console.log(`server running on port ${PORT}`);
  startCronJobs();
});
