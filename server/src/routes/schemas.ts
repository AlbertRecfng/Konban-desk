import { z } from 'zod';

export const titleSchema = z.string().trim().min(1, 'Название не может быть пустым');

export const positionSchema = z.object({
  position: z.number().int().min(0),
});

export const taskFieldsSchema = z.object({
  title: titleSchema.max(200),
  description: z.string().max(10_000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате ГГГГ-ММ-ДД')
    .nullable()
    .optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});
