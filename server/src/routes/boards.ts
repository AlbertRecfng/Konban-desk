import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../middleware/auth.js';
import { boardMemberIds, notifyBoardChanged } from '../realtime.js';
import { requireBoardRole } from '../services/accessService.js';
import { createBoard, deleteBoard, getBoardDetails, listBoards, updateBoard } from '../services/boardService.js';
import { createColumn } from '../services/columnService.js';
import { membersRouter } from './members.js';
import { parseId, validate } from '../utils/validate.js';
import { titleSchema } from './schemas.js';

export const boardsRouter = Router();

boardsRouter.use('/:boardId/members', membersRouter);

const boardSchema = z.object({
  title: titleSchema.max(100),
  description: z.string().max(2000).optional(),
});

boardsRouter.get('/', async (req, res) => {
  res.json(await listBoards(currentUserId(req)));
});

boardsRouter.post('/', async (req, res) => {
  const data = validate(boardSchema, req.body);
  res.status(201).json(await createBoard(currentUserId(req), data.title, data.description ?? ''));
});

boardsRouter.get('/:boardId', async (req, res) => {
  const boardId = parseId(req.params.boardId);
  const role = await requireBoardRole(currentUserId(req), boardId, 'viewer');
  res.json(await getBoardDetails(boardId, role));
});

boardsRouter.patch('/:boardId', async (req, res) => {
  const boardId = parseId(req.params.boardId);
  await requireBoardRole(currentUserId(req), boardId, 'owner');
  res.json(await updateBoard(boardId, validate(boardSchema.partial(), req.body)));
  void notifyBoardChanged(req, boardId);
});

boardsRouter.delete('/:boardId', async (req, res) => {
  const boardId = parseId(req.params.boardId);
  await requireBoardRole(currentUserId(req), boardId, 'owner');
  // После удаления участников уже не узнать, поэтому берём их заранее
  const recipients = await boardMemberIds(boardId);
  await deleteBoard(boardId);
  res.status(204).end();
  void notifyBoardChanged(req, boardId, recipients);
});

boardsRouter.post('/:boardId/columns', async (req, res) => {
  const boardId = parseId(req.params.boardId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  const data = validate(z.object({ title: titleSchema.max(100) }), req.body);
  res.status(201).json(await createColumn(boardId, data.title));
  void notifyBoardChanged(req, boardId);
});
