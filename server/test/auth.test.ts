import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool.js';
import { PASSWORD, app, createUser, uniqueEmail } from './helpers.js';

describe('Регистрация', () => {
  it('создаёт пользователя, выдаёт access-токен и refresh-cookie', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: 'Иван' }).expect(201);

    expect(res.body.user).toEqual({ id: expect.any(Number), email, name: 'Иван' });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(String(res.headers['set-cookie'])).toMatch(/refreshToken=.+HttpOnly/);
  });

  it('хранит пароль только в виде bcrypt-хеша', async () => {
    const { user } = await createUser();
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
  });

  it('не даёт зарегистрировать email повторно (без учёта регистра)', async () => {
    const { email } = await createUser();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD, name: 'Двойник' })
      .expect(409);
    expect(res.body.error).toMatch(/уже существует/);
  });

  it('проверяет длину пароля', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: uniqueEmail(), password: '123', name: 'А' }).expect(400);
    expect(res.body.error).toMatch(/минимум 8/);
  });
});

describe('Вход', () => {
  it('пускает с верным паролем', async () => {
    const { email, user } = await createUser();
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('отклоняет неверный пароль', async () => {
    const { email } = await createUser();
    await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
  });
});

describe('Защищённые маршруты и сессия', () => {
  it('без токена отвечают 401', async () => {
    await request(app).get('/api/boards').expect(401);
    await request(app).get('/api/boards').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('refresh-токен одноразовый: после обновления старый не работает', async () => {
    const { refreshCookie } = await createUser();
    const first = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(200);
    expect(first.body.accessToken).toEqual(expect.any(String));
    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('после выхода сессию нельзя обновить', async () => {
    const { refreshCookie } = await createUser();
    await request(app).post('/api/auth/logout').set('Cookie', refreshCookie).expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('удалённый пользователь сразу теряет доступ, даже с действующим токеном', async () => {
    const u = await createUser();
    await u.get('/api/boards').expect(200);
    await pool.query('DELETE FROM users WHERE id = $1', [u.user.id]);
    await u.get('/api/boards').expect(401);
  });
});
