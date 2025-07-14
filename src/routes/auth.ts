import { Router, Request, Response } from 'express';
import { QueryResult } from 'pg';
import { pool } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { verifyToken } from '../middleware/auth';
import {v4 as uuidv4} from 'uuid';

const router = Router();
const openai = new OpenAI ({
  apiKey: process.env.OPENAI_API_KEY,
})

interface ReqBodySignup {
  username: string,
  password: string,
  email: string
}

interface ReqBodyLogin {
  username: string;
  password: string;
}

interface ReqBodyChat {
  role: string;
  content: string;
  timestamp: string;
}

router.post('/signup', async (req: Request<{}, {}, ReqBodySignup>, res: Response) => {

  const { username, password, email } = req.body;
  const isEmailValid : boolean = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordStrong : boolean = password.length >= 8;
  if (!isEmailValid) {
     res.status(400).json({ error: 'Invalid email' });
  }

  if (!isPasswordStrong) {
     res.status(400).json({ error: 'Password too short' });
  }
  try {
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const result = await pool.query(
      'INSERT INTO users (id, username, password, email) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, username, hashedPassword, email]
    );
    
    res.status(201).json({ message: 'User created', userId: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'User already exists or invalid data' });
  }
 
});

router.post('/login', async (req: Request<{}, {}, ReqBodyLogin>, res: Response) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      res.status(401).json({error: 'Invalid credentials'});
    } 
    const isMatch = await bcrypt.compare(password, result.rows[0].password);    
    if(isMatch){
      const token = jwt.sign(
        {userId: result.rows[0].id, username: result.rows[0].username}, process.env.JWT_SECRET as string, {expiresIn:'1h'}
      );
      res.json({message: 'Login successful', token});
    } else {
      res.status(401).json({error: 'Login failed. Please try again correctly'});
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/chat', verifyToken, async (req: Request<{}, {}, ReqBodyChat>, res: Response) => {
  const { role, content, timestamp }: { role: string; content: string; timestamp: string }  = req.body;
  const user = req.user;

  try {
    const messageId = uuidv4();
    //save user message
    await pool.query(
      'INSERT INTO chat_message (id, sender, content, timestamp, user_id) VALUES ($1, $2, $3, $4, $5)',
      [messageId, user?.username || role, content, timestamp, user?.userId]
    );

    const historyResult: QueryResult<{ sender: string; content: string }> = await pool.query(
      'SELECT sender, content FROM chat_message WHERE user_id = $1 ORDER BY timestamp ASC', [user?.userId]
    );

    const fullHistory: ChatCompletionMessageParam[] = historyResult.rows.map(msg => ({
      role: msg.sender === 'gpt' ? 'assistant': 'user',
      content: msg.content
    }));
    
    fullHistory.push({role: 'user', content});

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: fullHistory,
    });

    const reply = completion.choices[0].message.content;

    const gptMessageId = uuidv4();

    await pool.query(
      'INSERT INTO chat_message (id, sender, content, timestamp, user_id) VALUES ($1, $2, $3, $4, $5)',
      [gptMessageId, 'gpt', reply, new Date().toISOString(), user?.userId]
    );

    res.json({ reply });
  } catch (err: any) {
    console.error("/chat error:", err);
    res.status(500).json({ error: err.message || 'Something went wrong with OpenAI' });
  }
})

router.get('/chat/history', verifyToken, async (req: Request, res: Response) => {
  const user = req.user;

  try {
    const result: QueryResult<{ sender: string; content: string; timestamp: string }> = await pool.query(
      'SELECT sender, content, timestamp FROM chat_message WHERE user_id = $1 ORDER BY timestamp ASC',
      [user?.userId]
    );

    const messages = result.rows.map((msg) => ({
      id: uuidv4(),
      role: msg.sender === 'gpt' ? 'assistant' : 'user',
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

export default router;
