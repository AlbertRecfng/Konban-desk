import { Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../middleware/auth.js';
import { notifyBoardChanged } from '../realtime.js';
import { boardIdOfTask, requireAssignable, requireBoardRole } from '../services/accessService.js';
import { deleteTask, getTask, moveTask, updateTask } from '../services/taskService.js';
import { parseId, validate } from '../utils/validate.js';
import { positionSchema, taskFieldsSchema } from './schemas.js';

export const tasksRouter = Router();

const moveSchema = positionSchema.extend({
  columnId: z.number().int().positive(),
});

tasksRouter.get('/:taskId', async (req, res) => {
  const taskId = parseId(req.params.taskId);
  await requireBoardRole(currentUserId(req), await boardIdOfTask(taskId), 'viewer');
  res.json(await getTask(taskId));
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const boardId = await boardIdOfTask(taskId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  const data = validate(taskFieldsSchema.partial(), req.body);
  await requireAssignable(boardId, data.assigneeId);
  res.json(await updateTask(taskId, data));
  void notifyBoardChanged(req, boardId);
});

tasksRouter.patch('/:taskId/move', async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const boardId = await boardIdOfTask(taskId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  const data = validate(moveSchema, req.body);
  res.json(await moveTask(taskId, boardId, data.columnId, data.position));
  void notifyBoardChanged(req, boardId);
});

tasksRouter.delete('/:taskId', async (req, res) => {
  const taskId = parseId(req.params.taskId);
  const boardId = await boardIdOfTask(taskId);
  await requireBoardRole(currentUserId(req), boardId, 'editor');
  await deleteTask(taskId);
  res.status(204).end();
  void notifyBoardChanged(req, boardId);
});
