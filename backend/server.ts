import app from './app';
import dotenv from 'dotenv';
import { startCronJobs } from './src/database/cronJobs';

dotenv.config();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
  startCronJobs(); 
});

