import cookieParser from 'cookie-parser';
import express from 'express';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { boardsRouter } from './routes/boards.js';
import { columnsRouter } from './routes/columns.js';
import { tasksRouter } from './routes/tasks.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/boards', requireAuth, boardsRouter);
  app.use('/api/columns', requireAuth, columnsRouter);
  app.use('/api/tasks', requireAuth, tasksRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
