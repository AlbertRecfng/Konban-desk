import { type Request, Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../middleware/auth.js';
import { boardMemberIds, notifyBoardChanged } from '../realtime.js';
import { requireBoardRole } from '../services/accessService.js';
import { addMember, changeMemberRole, listMembers, removeMember } from '../services/memberService.js';
import { parseId, validate } from '../utils/validate.js';

// Подключается как /api/boards/:boardId/members
export const membersRouter = Router({ mergeParams: true });

/** boardId приходит из родительского роутера (mergeParams), типы Express о нём не знают */
const boardIdOf = (req: Request) => parseId((req.params as Record<string, string>).boardId);

const roleSchema = z.enum(['editor', 'viewer'], { message: 'Роль должна быть editor или viewer' });

const inviteSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  role: roleSchema.default('editor'),
});

membersRouter.get('/', async (req, res) => {
  const boardId = boardIdOf(req);
  await requireBoardRole(currentUserId(req), boardId, 'viewer');
  res.json(await listMembers(boardId));
});

membersRouter.post('/', async (req, res) => {
  const boardId = boardIdOf(req);
  await requireBoardRole(currentUserId(req), boardId, 'owner');
  const data = validate(inviteSchema, req.body);
  res.status(201).json(await addMember(boardId, data.email, data.role));
  void notifyBoardChanged(req, boardId);
});

membersRouter.patch('/:userId', async (req, res) => {
  const boardId = boardIdOf(req);
  await requireBoardRole(currentUserId(req), boardId, 'owner');
  const { role } = validate(z.object({ role: roleSchema }), req.body);
  res.json(await changeMemberRole(boardId, parseId(req.params.userId), role));
  void notifyBoardChanged(req, boardId);
});

/** Владелец удаляет любого участника; любой участник может сам покинуть доску. */
membersRouter.delete('/:userId', async (req, res) => {
  const boardId = boardIdOf(req);
  const userId = parseId(req.params.userId);
  const me = currentUserId(req);
  await requireBoardRole(me, boardId, userId === me ? 'viewer' : 'owner');
  // Удалённый участник тоже должен узнать, что доступа больше нет
  const recipients = await boardMemberIds(boardId);
  await removeMember(boardId, userId);
  res.status(204).end();
  void notifyBoardChanged(req, boardId, recipients);
});
