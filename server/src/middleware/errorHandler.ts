import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../utils/httpError.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Ошибка разбора JSON из express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Некорректный JSON в теле запроса' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
};
