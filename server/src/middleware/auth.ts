import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { verifyAccessToken } from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Требуется авторизация');

  const userId = verifyAccessToken(header.slice('Bearer '.length));
  if (userId === null) throw new HttpError(401, 'Токен недействителен или истёк');

  // Токен подписан верно, но пользователя могли удалить уже после его выдачи
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!rowCount) throw new HttpError(401, 'Пользователь не найден');

  req.userId = userId;
  next();
}

export function currentUserId(req: Request): number {
  if (req.userId === undefined) throw new HttpError(401, 'Требуется авторизация');
  return req.userId;
}
