import { z } from 'zod';
import { HttpError } from './httpError.js';

export function validate<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    throw new HttpError(400, details[0]?.message ?? 'Некорректные данные', details);
  }
  return result.data;
}

const idSchema = z.coerce.number().int().positive();

export function parseId(value: unknown): number {
  const result = idSchema.safeParse(value);
  if (!result.success) throw new HttpError(404, 'Не найдено');
  return result.data;
}
