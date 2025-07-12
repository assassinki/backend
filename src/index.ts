import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import { pool } from './db';

dotenv.config();

const app = express();
app.use(cors({
  origin:'http://localhost:3000',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/auth', authRoutes);

// Ensure users table exists
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(100),
    password VARCHAR(100),
    email VARCHAR(100)
  );
`);

pool.query(`
  CREATE TABLE IF NOT EXISTS chat_message (
    id UUID PRIMARY KEY,
    sender VARCHAR(100),
    content VARCHAR(100),
    timestamp BIGINT
  );
`);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
