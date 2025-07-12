import { Router, Request, Response } from 'express';
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

interface ReqBody {
  username: string,
  password: string,
  email: string
}

router.post('/signup', async (req: Request, res: Response) => {

  const { username, password, email }: ReqBody = req.body;
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

router.post('/login', async (req: Request, res: Response) => {
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

router.post('/chat', verifyToken, async (req, res) => {
  const { role, content, timestamp }: { role: string; content: string; timestamp: number }  = req.body;
  const user = req.user;

  try {
    const messageId = uuidv4();
    //save user message
    await pool.query(
      'INSERT INTO chat_message (id, sender, content, timestamp) VALUES ($1, $2, $3, $4)',
      [messageId, user?.username || role, content, timestamp]
    );
    const sendmessage:ChatCompletionMessageParam[] = [
      { role: 'user', content}
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: sendmessage
    });

    const reply = completion.choices[0].message.content;

    const gptMessageId = uuidv4();
    
    await pool.query(
      'INSERT INTO chat_message (id, sender, content, timestamp) VALUES ($1, $2, $3, $4)',
      [gptMessageId, 'gpt', reply, timestamp]
    );
    res.json({reply});
  } catch (err) {
    res.status(500).json({error: 'Something went wrong with OpenAI'});
  }

})

export default router;
