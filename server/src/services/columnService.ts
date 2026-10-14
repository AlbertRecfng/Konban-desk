import type pg from 'pg';
import { buildSetClause, pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

const COLUMN_FIELDS = `id, board_id AS "boardId", title, position, wip_limit AS "wipLimit"`;

/**
 * Блокирует строку доски до конца транзакции. Все изменения порядка колонок
 * одной доски выполняются строго по очереди и не портят позиции друг другу.
 */
async function lockBoard(client: pg.PoolClient, boardId: number) {
  await client.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [boardId]);
}

export async function createColumn(boardId: number, title: string) {
  return withTransaction(async (client) => {
    await lockBoard(client, boardId);
    const { rows } = await client.query(
      `INSERT INTO board_columns (board_id, title, position)
       VALUES ($1, $2, (SELECT count(*) FROM board_columns WHERE board_id = $1))
       RETURNING ${COLUMN_FIELDS}`,
      [boardId, title],
    );
    return { ...rows[0], tasks: [] };
  });
}

/** Меняет название и/или WIP-лимит. Лимит меньше текущего числа задач допустим: колонка
 * просто считается переполненной, и новые задачи в неё не попадут, пока лишние не уберут. */
export async function updateColumn(columnId: number, data: { title?: string; wipLimit?: number | null }) {
  const set = buildSetClause({ title: data.title, wip_limit: data.wipLimit }, 2);
  if (!set.params.length) throw new HttpError(400, 'Нет полей для обновления');
  const { rows } = await pool.query(`UPDATE board_columns SET ${set.sql} WHERE id = $1 RETURNING ${COLUMN_FIELDS}`, [
    columnId,
    ...set.params,
  ]);
  return rows[0];
}

export async function moveColumn(boardId: number, columnId: number, requestedPosition: number) {
  return withTransaction(async (client) => {
    await lockBoard(client, boardId);
    const { rows } = await client.query<{ position: number; total: number }>(
      `SELECT position, (SELECT count(*)::int FROM board_columns WHERE board_id = $2) AS total
         FROM board_columns WHERE id = $1 AND board_id = $2`,
      [columnId, boardId],
    );
    if (!rows[0]) throw new HttpError(404, 'Колонка не найдена');
    const { position: from, total } = rows[0];
    const to = Math.min(Math.max(requestedPosition, 0), total - 1);

    if (to > from) {
      await client.query(
        `UPDATE board_columns SET position = position - 1
          WHERE board_id = $1 AND position > $2 AND position <= $3`,
        [boardId, from, to],
      );
    } else if (to < from) {
      await client.query(
        `UPDATE board_columns SET position = position + 1
          WHERE board_id = $1 AND position >= $2 AND position < $3`,
        [boardId, to, from],
      );
    }
    const result = await client.query(
      `UPDATE board_columns SET position = $2 WHERE id = $1 RETURNING ${COLUMN_FIELDS}`,
      [columnId, to],
    );
    return result.rows[0];
  });
}

export async function deleteColumn(boardId: number, columnId: number) {
  await withTransaction(async (client) => {
    await lockBoard(client, boardId);
    const { rows } = await client.query<{ position: number }>(
      'DELETE FROM board_columns WHERE id = $1 AND board_id = $2 RETURNING position',
      [columnId, boardId],
    );
    if (!rows[0]) throw new HttpError(404, 'Колонка не найдена');
    await client.query('UPDATE board_columns SET position = position - 1 WHERE board_id = $1 AND position > $2', [
      boardId,
      rows[0].position,
    ]);
  });
}
