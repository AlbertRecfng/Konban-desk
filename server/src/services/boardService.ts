import { buildSetClause, pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import type { BoardRole } from './accessService.js';
import { listMembers } from './memberService.js';

const DEFAULT_COLUMNS = ['К выполнению', 'В работе', 'Готово'];

const BOARD_FIELDS = `b.id, b.title, b.description, b.created_at AS "createdAt"`;

export async function listBoards(userId: number) {
  const { rows } = await pool.query(
    `SELECT ${BOARD_FIELDS}, bm.role,
            (SELECT count(*)::int
               FROM tasks t JOIN board_columns c ON c.id = t.column_id
              WHERE c.board_id = b.id) AS "taskCount"
       FROM boards b
       JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function createBoard(userId: number, title: string, description: string) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO boards AS b (title, description, owner_id) VALUES ($1, $2, $3)
       RETURNING ${BOARD_FIELDS}`,
      [title, description, userId],
    );
    const board = rows[0];
    await client.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      board.id,
      userId,
    ]);
    await client.query(
      `INSERT INTO board_columns (board_id, title, position)
       SELECT $1, t.title, t.ord - 1 FROM unnest($2::text[]) WITH ORDINALITY AS t(title, ord)`,
      [board.id, DEFAULT_COLUMNS],
    );
    return { ...board, role: 'owner' as BoardRole, taskCount: 0 };
  });
}

/** Доска целиком: участники и колонки по порядку, в каждой массив задач по порядку. */
export async function getBoardDetails(boardId: number, role: BoardRole) {
  const boardResult = await pool.query(`SELECT ${BOARD_FIELDS} FROM boards b WHERE b.id = $1`, [boardId]);
  if (!boardResult.rows[0]) throw new HttpError(404, 'Доска не найдена');

  const columnsResult = await pool.query(
    `SELECT c.id, c.title, c.position, c.wip_limit AS "wipLimit",
            COALESCE(
              json_agg(json_build_object(
                'id', t.id, 'columnId', t.column_id, 'title', t.title,
                'description', t.description, 'priority', t.priority,
                'dueDate', t.due_date, 'assigneeId', t.assignee_id, 'position', t.position, 'createdAt', t.created_at
              ) ORDER BY t.position) FILTER (WHERE t.id IS NOT NULL),
              '[]'
            ) AS tasks
       FROM board_columns c
       LEFT JOIN tasks t ON t.column_id = c.id
      WHERE c.board_id = $1
      GROUP BY c.id
      ORDER BY c.position`,
    [boardId],
  );

  return { ...boardResult.rows[0], role, members: await listMembers(boardId), columns: columnsResult.rows };
}

export async function updateBoard(boardId: number, data: { title?: string; description?: string }) {
  const set = buildSetClause({ title: data.title, description: data.description }, 2);
  if (!set.params.length) throw new HttpError(400, 'Нет полей для обновления');
  const { rows } = await pool.query(
    `UPDATE boards AS b SET ${set.sql} WHERE b.id = $1 RETURNING ${BOARD_FIELDS}`,
    [boardId, ...set.params],
  );
  return rows[0];
}

export async function deleteBoard(boardId: number) {
  await pool.query('DELETE FROM boards WHERE id = $1', [boardId]);
}
