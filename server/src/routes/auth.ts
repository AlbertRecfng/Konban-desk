import { type CookieOptions, type Response, Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { currentUserId, requireAuth } from '../middleware/auth.js';
import {
  type PublicUser,
  authenticate,
  getUserById,
  issueRefreshToken,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../services/authService.js';
import { HttpError } from '../utils/httpError.js';
import { validate } from '../utils/validate.js';

export const authRouter = Router();

const REFRESH_COOKIE = 'refreshToken';
const COOKIE_PATH = '/api/auth';

const registerSchema = z.object({
  email: z.string().trim().email('Некорректный email').max(255),
  password: z.string().min(8, 'Пароль должен содержать минимум 8 символов').max(72, 'Пароль слишком длинный'),
  name: z.string().trim().min(1, 'Введите имя').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Введите email'),
  password: z.string().min(1, 'Введите пароль'),
});

function setRefreshCookie(res: Response, token: string, expires: Date) {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: COOKIE_PATH,
    expires,
  };
  res.cookie(REFRESH_COOKIE, token, options);
}

async function startSession(res: Response, user: PublicUser) {
  const { token, expiresAt } = await issueRefreshToken(user.id);
  setRefreshCookie(res, token, expiresAt);
  return { user, accessToken: signAccessToken(user.id) };
}

authRouter.post('/register', async (req, res) => {
  const data = validate(registerSchema, req.body);
  const user = await registerUser(data.email, data.password, data.name);
  res.status(201).json(await startSession(res, user));
});

authRouter.post('/login', async (req, res) => {
  const data = validate(loginSchema, req.body);
  const user = await authenticate(data.email, data.password);
  res.json(await startSession(res, user));
});

authRouter.post('/refresh', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new HttpError(401, 'Нет активной сессии');
  try {
    const { user, token: nextToken, expiresAt } = await rotateRefreshToken(token);
    setRefreshCookie(res, nextToken, expiresAt);
    res.json({ user, accessToken: signAccessToken(user.id) });
  } catch (error) {
    if (error instanceof HttpError) res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
    throw error;
  }
});

authRouter.post('/logout', async (req, res) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(currentUserId(req));
  if (!user) throw new HttpError(404, 'Пользователь не найден');
  res.json({ user });
});
