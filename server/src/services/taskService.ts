import type pg from 'pg';
import { buildSetClause, pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

export type Priority = 'low' | 'medium' | 'high';

export interface TaskInput {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  assigneeId?: number | null;
}

const TASK_FIELDS = `id, column_id AS "columnId", title, description, priority,
  due_date AS "dueDate", assignee_id AS "assigneeId", position, created_at AS "createdAt", updated_at AS "updatedAt"`;

interface LockedColumn {
  id: number;
  board_id: number;
  title: string;
  wip_limit: number | null;
}

/**
 * Блокирует колонки в порядке возрастания id: две транзакции, переносящие
 * задачи между одними и теми же колонками, не попадут во взаимоблокировку.
 * Блокировка же гарантирует, что два параллельных запроса не превысят WIP-лимит.
 */
async function lockColumns(client: pg.PoolClient, columnIds: number[]) {
  const { rows } = await client.query<LockedColumn>(
    'SELECT id, board_id, title, wip_limit FROM board_columns WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
    [columnIds],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** taskCount - сколько задач уже в колонке (не считая переносимую). */
function assertWipLimit(column: LockedColumn, taskCount: number) {
  if (column.wip_limit !== null && taskCount >= column.wip_limit) {
    throw new HttpError(409, `В колонке «${column.title}» достигнут лимит задач (${column.wip_limit})`);
  }
}

async function columnOfTask(taskId: number): Promise<number> {
  const { rows } = await pool.query<{ column_id: number }>('SELECT column_id FROM tasks WHERE id = $1', [taskId]);
  if (!rows[0]) throw new HttpError(404, 'Задача не найдена');
  return rows[0].column_id;
}

export async function createTask(columnId: number, userId: number, data: TaskInput & { title: string }) {
  return withTransaction(async (client) => {
    const column = (await lockColumns(client, [columnId])).get(columnId);
    if (!column) throw new HttpError(404, 'Колонка не найдена');
    const { rows: countRows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tasks WHERE column_id = $1',
      [columnId],
    );
    const position = countRows[0].n;
    assertWipLimit(column, position);

    const { rows } = await client.query(
      `INSERT INTO tasks (column_id, title, description, priority, due_date, assignee_id, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${TASK_FIELDS}`,
      [
        columnId,
        data.title,
        data.description ?? '',
        data.priority ?? 'medium',
        data.dueDate ?? null,
        data.assigneeId ?? null,
        userId,
        position,
      ],
    );
    return rows[0];
  });
}

export async function getTask(taskId: number) {
  const { rows } = await pool.query(`SELECT ${TASK_FIELDS} FROM tasks WHERE id = $1`, [taskId]);
  if (!rows[0]) throw new HttpError(404, 'Задача не найдена');
  return rows[0];
}

export async function updateTask(taskId: number, data: TaskInput) {
  const set = buildSetClause(
    {
      title: data.title,
      description: data.description,
      priority: data.priority,
      due_date: data.dueDate,
      assignee_id: data.assigneeId,
    },
    2,
  );
  if (!set.params.length) throw new HttpError(400, 'Нет полей для обновления');
  const { rows } = await pool.query(`UPDATE tasks SET ${set.sql} WHERE id = $1 RETURNING ${TASK_FIELDS}`, [
    taskId,
    ...set.params,
  ]);
  return rows[0];
}

/**
 * Перенос задачи в колонку toColumnId на позицию position (внутри той же колонки тоже).
 * Алгоритм: «вынимаем» задачу (сдвигаем следующие за ней вверх), затем
 * «вставляем» (сдвигаем задачи начиная с новой позиции вниз).
 */
export async function moveTask(taskId: number, boardId: number, toColumnId: number, position: number) {
  const fromColumnId = await columnOfTask(taskId);

  return withTransaction(async (client) => {
    const columns = await lockColumns(client, [fromColumnId, toColumnId]);
    const target = columns.get(toColumnId);
    if (target?.board_id !== boardId) throw new HttpError(400, 'Колонка не найдена на этой доске');

    const { rows } = await client.query<{ column_id: number; position: number }>(
      'SELECT column_id, position FROM tasks WHERE id = $1',
      [taskId],
    );
    const task = rows[0];
    if (!task) throw new HttpError(404, 'Задача не найдена');
    // Пока мы ждали блокировку, задачу мог перенести другой пользователь
    if (task.column_id !== fromColumnId) throw new HttpError(409, 'Задача была изменена, обновите страницу');

    const { rows: countRows } = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tasks WHERE column_id = $1 AND id <> $2',
      [toColumnId, taskId],
    );
    // Перестановка внутри колонки число задач в ней не меняет, поэтому лимит проверяем только при переносе
    if (toColumnId !== fromColumnId) assertWipLimit(target, countRows[0].n);
    const to = Math.min(Math.max(position, 0), countRows[0].n);

    await client.query('UPDATE tasks SET position = position - 1 WHERE column_id = $1 AND position > $2', [
      fromColumnId,
      task.position,
    ]);
    await client.query(
      'UPDATE tasks SET position = position + 1 WHERE column_id = $1 AND position >= $2 AND id <> $3',
      [toColumnId, to, taskId],
    );
    const result = await client.query(
      `UPDATE tasks SET column_id = $2, position = $3 WHERE id = $1 RETURNING ${TASK_FIELDS}`,
      [taskId, toColumnId, to],
    );
    return result.rows[0];
  });
}

export async function deleteTask(taskId: number) {
  const columnId = await columnOfTask(taskId);
  await withTransaction(async (client) => {
    await lockColumns(client, [columnId]);
    const { rows } = await client.query<{ position: number }>(
      'DELETE FROM tasks WHERE id = $1 AND column_id = $2 RETURNING position',
      [taskId, columnId],
    );
    if (!rows[0]) throw new HttpError(409, 'Задача была изменена, обновите страницу');
    await client.query('UPDATE tasks SET position = position - 1 WHERE column_id = $1 AND position > $2', [
      columnId,
      rows[0].position,
    ]);
  });
}
