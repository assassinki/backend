import { Router, Request, Response } from 'express';
import { pool } from '../db';
import bcrypt, { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { error } from 'console';

const router = Router();

router.post('/signup', async (req: Request, res: Response) => {
    console.log(req.body);
  
  const { username, password, email } = req.body;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPasswordStrong = password.length >= 8;
  if (!isEmailValid) {
     res.status(400).json({ error: 'Invalid email' });
  }

  if (!isPasswordStrong) {
     res.status(400).json({ error: 'Password too short' });
  }
  try {
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id',
      [username, hashedPassword, email]
    );
    
    res.status(201).json({ message: 'User created', userId: result.rows[0].id });
  } catch (err) {
    console.error("Signup error", err);
    res.status(400).json({ error: 'User already exists or invalid data' });
  }
  console.log(error);
});

router.post('/login', async (req: Request, res: Response) => {
  const { username, password, email } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      res.status(401).json({error: 'Invalid credentials'});
    } 
    const isMatch = await bcrypt.compare(password, result.rows[0].password);
    const isEmail = await compare(email, result.rows[0].email);
    if(isMatch || isEmail){
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

export default router;
