import { type Db, isUniqueViolation, pool, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import type { BoardRole } from './accessService.js';

/** Роль, которую можно выдать приглашённому: владелец у доски всегда один */
export type MemberRole = Exclude<BoardRole, 'owner'>;

const MEMBER_FIELDS = `u.id AS "userId", u.name, u.email, bm.role, bm.added_at AS "addedAt"`;

export async function listMembers(boardId: number, db: Db = pool) {
  const { rows } = await db.query(
    `SELECT ${MEMBER_FIELDS}
       FROM board_members bm JOIN users u ON u.id = bm.user_id
      WHERE bm.board_id = $1
      ORDER BY bm.role = 'owner' DESC, bm.added_at`,
    [boardId],
  );
  return rows;
}

async function getMember(boardId: number, userId: number, db: Db = pool) {
  const { rows } = await db.query(
    `SELECT ${MEMBER_FIELDS}
       FROM board_members bm JOIN users u ON u.id = bm.user_id
      WHERE bm.board_id = $1 AND bm.user_id = $2`,
    [boardId, userId],
  );
  return rows[0] as { userId: number; role: BoardRole } | undefined;
}

export async function addMember(boardId: number, email: string, role: MemberRole) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  if (!user) throw new HttpError(404, 'Пользователь с таким email не зарегистрирован');

  try {
    await pool.query('INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)', [boardId, user.id, role]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, 'Этот пользователь уже участник доски');
    throw error;
  }
  return getMember(boardId, user.id);
}

/** Проверяет, что участник есть и он не владелец (владельца нельзя понизить или удалить). */
async function requireNonOwnerMember(boardId: number, userId: number, db: Db) {
  const member = await getMember(boardId, userId, db);
  if (!member) throw new HttpError(404, 'Участник не найден');
  if (member.role === 'owner') throw new HttpError(400, 'Нельзя изменить или удалить владельца доски');
}

export async function changeMemberRole(boardId: number, userId: number, role: MemberRole) {
  await requireNonOwnerMember(boardId, userId, pool);
  await pool.query('UPDATE board_members SET role = $3 WHERE board_id = $1 AND user_id = $2', [boardId, userId, role]);
  return getMember(boardId, userId);
}

/** Удаляет участника и снимает его с задач этой доски: исполнителем может быть только участник. */
export async function removeMember(boardId: number, userId: number) {
  await withTransaction(async (client) => {
    await requireNonOwnerMember(boardId, userId, client);
    await client.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
    await client.query(
      `UPDATE tasks SET assignee_id = NULL
        WHERE assignee_id = $2 AND column_id IN (SELECT id FROM board_columns WHERE board_id = $1)`,
      [boardId, userId],
    );
  });
}
