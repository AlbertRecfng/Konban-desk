import { describe, expect, it } from 'vitest';
import { createBoard, createTask, createUser, getBoard, titlesByColumn } from './helpers.js';

async function boardWithLimit(limit: number) {
  const user = await createUser();
  const board = await createBoard(user);
  const [todo, doing] = board.columns;
  await user.patch(`/api/columns/${doing.id}`, { wipLimit: limit }).expect(200);
  return { user, board, todo, doing };
}

describe('WIP-лимит колонки', () => {
  it('сохраняется и приходит вместе с доской', async () => {
    const { user, board, doing } = await boardWithLimit(2);
    const details = await getBoard(user, board.id);
    expect(details.columns.find((c) => c.id === doing.id)).toMatchObject({ wipLimit: 2 });
  });

  it('не даёт создать задачу в заполненной колонке', async () => {
    const { user, doing } = await boardWithLimit(2);
    await createTask(user, doing.id, 'Первая');
    await createTask(user, doing.id, 'Вторая');
    const res = await user.post(`/api/columns/${doing.id}/tasks`, { title: 'Третья' }).expect(409);
    expect(res.body.error).toBe('В колонке «В работе» достигнут лимит задач (2)');
  });

  it('не даёт перенести задачу в заполненную колонку, но порядок внутри неё менять можно', async () => {
    const { user, board, todo, doing } = await boardWithLimit(2);
    const a = await createTask(user, doing.id, 'A');
    await createTask(user, doing.id, 'B');
    const x = await createTask(user, todo.id, 'X');

    await user.patch(`/api/tasks/${x.id}/move`, { columnId: doing.id, position: 0 }).expect(409);
    await user.patch(`/api/tasks/${a.id}/move`, { columnId: doing.id, position: 1 }).expect(200);
    expect(titlesByColumn(await getBoard(user, board.id))[1]).toEqual(['B', 'A']);
  });

  it('снятие лимита (null) снова разрешает добавлять задачи', async () => {
    const { user, doing } = await boardWithLimit(1);
    await createTask(user, doing.id, 'Первая');
    await user.post(`/api/columns/${doing.id}/tasks`, { title: 'Вторая' }).expect(409);
    await user.patch(`/api/columns/${doing.id}`, { wipLimit: null }).expect(200);
    await user.post(`/api/columns/${doing.id}/tasks`, { title: 'Вторая' }).expect(201);
  });

  it('лимит можно поставить ниже текущего числа задач: колонка переполнена, новые не добавить', async () => {
    const user = await createUser();
    const board = await createBoard(user);
    const column = board.columns[0];
    for (const title of ['A', 'B', 'C']) await createTask(user, column.id, title);

    await user.patch(`/api/columns/${column.id}`, { wipLimit: 2 }).expect(200);
    await user.post(`/api/columns/${column.id}/tasks`, { title: 'D' }).expect(409);
  });

  it('проверяет значение лимита', async () => {
    const user = await createUser();
    const board = await createBoard(user);
    const columnId = board.columns[0].id;
    await user.patch(`/api/columns/${columnId}`, { wipLimit: 0 }).expect(400);
    await user.patch(`/api/columns/${columnId}`, { wipLimit: 2.5 }).expect(400);
    await user.patch(`/api/columns/${columnId}`, {}).expect(400);
  });

  it('одновременные запросы не превышают лимит', async () => {
    const { user, board, doing } = await boardWithLimit(3);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => user.post(`/api/columns/${doing.id}/tasks`, { title: `Задача ${i}` })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(titlesByColumn(await getBoard(user, board.id))[1]).toHaveLength(3);
  });
});
