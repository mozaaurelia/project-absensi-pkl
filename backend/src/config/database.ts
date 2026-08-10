import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const  pool = new Pool ({
    connectionString: process.env.DATABASE,
    ssl: { rejectUnauthorized: false},
})

pool.query('SELECT NOW()').
    then((res) => {console.log('DATABASE CONNECTED', res.rows[0].now)}).
    catch((err) => {console.log('DATABASE CONNECTED', err.message)})