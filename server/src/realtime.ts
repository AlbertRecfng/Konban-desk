import type { Server as HttpServer } from 'node:http';
import type { Request } from 'express';
import { Server } from 'socket.io';
import { type Db, pool } from './db/pool.js';
import { verifyAccessToken } from './services/authService.js';

/**
 * Обновления в реальном времени через Socket.IO.
 *
 * Каждое подключение входит в «комнату» своего пользователя (user:<id>). После изменения
 * доски сервер шлёт её участникам событие board:changed только с id доски, без самих данных.
 * Клиент в ответ заново загружает доску обычным запросом к API, где действуют все проверки прав.
 */

export const SOCKET_PATH = '/api/socket.io';
/** Заголовок, в котором клиент передаёт id своего сокета: автору изменения событие не нужно */
const SOCKET_ID_HEADER = 'x-socket-id';

let io: Server | null = null;

export function attachRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { path: SOCKET_PATH, serveClient: false });

  // Подключиться можно только с действующим access-токеном
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const userId = typeof token === 'string' ? verifyAccessToken(token) : null;
    if (userId === null) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);
  });
  return io;
}

/** id всех участников доски. Для удаления доски или участника их нужно взять ДО изменения. */
export async function boardMemberIds(boardId: number, db: Db = pool): Promise<number[]> {
  const { rows } = await db.query<{ user_id: number }>('SELECT user_id FROM board_members WHERE board_id = $1', [boardId]);
  return rows.map((row) => row.user_id);
}

/**
 * Сообщает участникам, что доска изменилась. Ошибки только логируются: изменение
 * уже сохранено в БД, и запрос пользователя не должен из-за уведомления падать.
 */
export async function notifyBoardChanged(req: Request, boardId: number, recipients?: number[]) {
  if (!io) return;
  try {
    const userIds = recipients ?? (await boardMemberIds(boardId));
    if (!userIds.length) return;
    let target = io.to(userIds.map((id) => `user:${id}`));
    const origin = req.get(SOCKET_ID_HEADER);
    if (origin) target = target.except(origin);
    target.emit('board:changed', { boardId });
  } catch (error) {
    console.error('Не удалось отправить уведомление об изменении доски', error);
  }
}
