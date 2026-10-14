import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';

export const app = createApp();

let counter = 0;

export const PASSWORD = 'password123';

export function uniqueEmail() {
  return `user${Date.now()}_${counter++}@test.ru`;
}

/** Регистрирует нового пользователя и возвращает клиента, который шлёт запросы с его токеном. */
export async function createUser(name = 'Тестовый пользователь') {
  const email = uniqueEmail();
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name }).expect(201);
  const token: string = res.body.accessToken;
  const auth = { Authorization: `Bearer ${token}` };

  return {
    user: res.body.user as { id: number; email: string; name: string },
    email,
    token,
    refreshCookie: String(res.headers['set-cookie']).split(';')[0],
    get: (url: string) => request(app).get(url).set(auth),
    post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
    patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
    delete: (url: string) => request(app).delete(url).set(auth),
  };
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

export interface BoardDetails {
  id: number;
  members: { userId: number; role: string }[];
  columns: { id: number; title: string; tasks: { id: number; title: string; position: number; assigneeId: number | null }[] }[];
}

/** Создаёт доску (с тремя колонками по умолчанию) и возвращает её полное содержимое. */
export async function createBoard(owner: TestUser, title = 'Тестовая доска'): Promise<BoardDetails> {
  const res = await owner.post('/api/boards', { title }).expect(201);
  return getBoard(owner, res.body.id);
}

export async function getBoard(user: TestUser, boardId: number): Promise<BoardDetails> {
  return (await user.get(`/api/boards/${boardId}`).expect(200)).body;
}

export async function createTask(user: TestUser, columnId: number, title: string) {
  return (await user.post(`/api/columns/${columnId}/tasks`, { title }).expect(201)).body as { id: number };
}

/** Позиции в каждой колонке должны идти подряд: 0, 1, 2… без пропусков и повторов. */
export function expectContiguousPositions(board: BoardDetails) {
  for (const column of board.columns) {
    expect(column.tasks.map((t) => t.position)).toEqual(column.tasks.map((_, i) => i));
  }
}

export const titlesByColumn = (board: BoardDetails) => board.columns.map((c) => c.tasks.map((t) => t.title));
