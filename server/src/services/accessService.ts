import { type Db, pool } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

export type BoardRole = 'owner' | 'editor' | 'viewer';

const ROLE_RANK: Record<BoardRole, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Проверяет, что пользователь участник доски с ролью не ниже minRole.
 * Чужая доска выглядит как несуществующая (404), чтобы не раскрывать её наличие.
 */
export async function requireBoardRole(userId: number, boardId: number, minRole: BoardRole, db: Db = pool) {
  const { rows } = await db.query<{ role: BoardRole }>(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  const role = rows[0]?.role;
  if (!role) throw new HttpError(404, 'Доска не найдена');
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw new HttpError(403, 'Недостаточно прав');
  return role;
}

/** Исполнителем задачи может быть только участник доски (null - снять исполнителя). */
export async function requireAssignable(boardId: number, assigneeId: number | null | undefined, db: Db = pool) {
  if (assigneeId === null || assigneeId === undefined) return;
  const { rowCount } = await db.query('SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2', [
    boardId,
    assigneeId,
  ]);
  if (!rowCount) throw new HttpError(400, 'Исполнитель должен быть участником доски');
}

export async function boardIdOfColumn(columnId: number, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ board_id: number }>('SELECT board_id FROM board_columns WHERE id = $1', [columnId]);
  if (!rows[0]) throw new HttpError(404, 'Колонка не найдена');
  return rows[0].board_id;
}

export async function boardIdOfTask(taskId: number, db: Db = pool): Promise<number> {
  const { rows } = await db.query<{ board_id: number }>(
    `SELECT c.board_id FROM tasks t JOIN board_columns c ON c.id = t.column_id WHERE t.id = $1`,
    [taskId],
  );
  if (!rows[0]) throw new HttpError(404, 'Задача не найдена');
  return rows[0].board_id;
}
