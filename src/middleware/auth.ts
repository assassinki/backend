import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';

interface JwtPayload {
    userId:number;
    username: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export const verifyToken = (req:Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if(!authHeader) {
        res.status(403).json({message: 'No token provided'});
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
        req.user = decoded;
        next();
    } catch(err) {
        res.status(401).json({message: 'Invalid or expired token'});
        return;
    }
}