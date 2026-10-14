import type { UniqueIdentifier } from '@dnd-kit/core';

// Колонки и задачи лежат в одном DndContext, поэтому их id различаются префиксом

export const columnDndId = (id: number) => `column-${id}`;
export const taskDndId = (id: number) => `task-${id}`;

export function parseDndId(id: UniqueIdentifier): { type: 'column' | 'task'; id: number } {
  const [type, value] = String(id).split('-');
  return { type: type === 'column' ? 'column' : 'task', id: Number(value) };
}
