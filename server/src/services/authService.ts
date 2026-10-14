import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { type Db, isUniqueViolation, pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

export interface PublicUser {
  id: number;
  email: string;
  name: string;
}

const BCRYPT_ROUNDS = 10;

export async function registerUser(email: string, password: string, name: string): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { rows } = await pool.query<PublicUser>(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [email.toLowerCase(), passwordHash, name],
    );
    return rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'Пользователь с таким email уже существует');
    throw error;
  }
}

export async function authenticate(email: string, password: string): Promise<PublicUser> {
  const { rows } = await pool.query<PublicUser & { password_hash: string }>(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Неверный email или пароль');
  }
  return { id: user.id, email: user.email, name: user.name };
}

export async function getUserById(id: number, db: Db = pool): Promise<PublicUser | undefined> {
  const { rows } = await db.query<PublicUser>('SELECT id, email, name FROM users WHERE id = $1', [id]);
  return rows[0];
}

export function signAccessToken(userId: number): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

/** Возвращает id пользователя из access-токена или null, если токен неверный или истёк. */
export function verifyAccessToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || !payload.sub) return null;
    return Number(payload.sub);
  } catch {
    return null;
  }
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function issueRefreshToken(userId: number, db: Db = pool) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at < now()', [userId]);
  await db.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    hashToken(token),
    expiresAt,
  ]);
  return { token, expiresAt };
}

/** Ротация: старый токен удаляется, взамен выдаётся новый. */
export async function rotateRefreshToken(oldToken: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ user_id: number; expires_at: Date }>(
      'DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING user_id, expires_at',
      [hashToken(oldToken)],
    );
    const row = rows[0];
    if (!row || row.expires_at < new Date()) throw new HttpError(401, 'Сессия истекла, войдите снова');

    const user = await getUserById(row.user_id, client);
    if (!user) throw new HttpError(401, 'Пользователь не найден');
    const next = await issueRefreshToken(user.id, client);
    return { user, ...next };
  });
}

export async function revokeRefreshToken(token: string) {
  await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(token)]);
}
