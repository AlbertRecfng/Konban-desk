import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../middleware/auth.js';
import { notifyBoardChanged } from '../realtime.js';
import { boardIdOfColumn, requireAssignable, requireBoardRole } from '../services/accessService.js';
import { deleteColumn, moveColumn, updateColumn } from '../services/columnService.js';
import { createTask } from '../services/taskService.js';
import { parseId, validate } from '../utils/validate.js';
import { positionSchema, taskFieldsSchema, titleSchema } from './schemas.js';

export const columnsRouter = Router();

const columnUpdateSchema = z.object({
  title: titleSchema.max(100).optional(),
  wipLimit: z.number().int().min(1, 'Лимит должен быть не меньше 1').max(100, 'Лимит не больше 100').nullable().optional(),
});

columnsRouter.patch('/:columnId', async (req, res) => {
  const columnId = parseId(req.params.columnId);
  const boardId = await boardIdOfColumn(columnId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  res.json(await updateColumn(columnId, validate(columnUpdateSchema, req.body)));
  void notifyBoardChanged(req, boardId);
});

columnsRouter.patch('/:columnId/move', async (req, res) => {
  const columnId = parseId(req.params.columnId);
  const boardId = await boardIdOfColumn(columnId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  const { position } = validate(positionSchema, req.body);
  res.json(await moveColumn(boardId, columnId, position));
  void notifyBoardChanged(req, boardId);
});

columnsRouter.delete('/:columnId', async (req, res) => {
  const columnId = parseId(req.params.columnId);
  const boardId = await boardIdOfColumn(columnId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  await deleteColumn(boardId, columnId);
  res.status(204).end();
  void notifyBoardChanged(req, boardId);
});

columnsRouter.post('/:columnId/tasks', async (req, res) => {
  const columnId = parseId(req.params.columnId);
  const userId = currentUserId(req);
  const boardId = await boardIdOfColumn(columnId);
  await requireBoardRole(userId, boardId, 'editor');
  const data = validate(taskFieldsSchema, req.body);
  await requireAssignable(boardId, data.assigneeId);
  res.status(201).json(await createTask(columnId, userId, data));
  void notifyBoardChanged(req, boardId);
});
