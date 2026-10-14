import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { boardsRouter } from './routes/boards.js';
import { columnsRouter } from './routes/columns.js';
import { tasksRouter } from './routes/tasks.js';

// Собранный клиент (npm run build). Путь одинаков из src/ (tsx) и из dist/ (node)
const CLIENT_DIST = path.resolve(import.meta.dirname, '../../client/dist');

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

  // Production: тот же сервер отдаёт и сайт. В разработке клиент обслуживает Vite,
  // а папки dist может не быть
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false }));
    // Все остальные GET-адреса (/boards/5 и т.п.) - это страницы React-приложения
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
