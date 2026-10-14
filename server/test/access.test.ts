import { describe, expect, it } from 'vitest';
import { createBoard, createTask, createUser } from './helpers.js';

describe('Доступ к чужой доске', () => {
  it('для постороннего доска выглядит несуществующей (404)', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const board = await createBoard(owner);
    const column = board.columns[0];
    const task = await createTask(owner, column.id, 'Секретная задача');

    await stranger.get(`/api/boards/${board.id}`).expect(404);
    await stranger.patch(`/api/boards/${board.id}`, { title: 'Взлом' }).expect(404);
    await stranger.delete(`/api/boards/${board.id}`).expect(404);
    await stranger.post(`/api/columns/${column.id}/tasks`, { title: 'Чужая' }).expect(404);
    await stranger.get(`/api/tasks/${task.id}`).expect(404);
    await stranger.delete(`/api/tasks/${task.id}`).expect(404);

    const list = await stranger.get('/api/boards').expect(200);
    expect(list.body).toEqual([]);
  });
});

describe('Роли участников', () => {
  it('наблюдатель только читает, редактор меняет задачи, но не доску', async () => {
    const owner = await createUser();
    const editor = await createUser();
    const viewer = await createUser();
    const board = await createBoard(owner);
    await owner.post(`/api/boards/${board.id}/members`, { email: editor.email, role: 'editor' }).expect(201);
    await owner.post(`/api/boards/${board.id}/members`, { email: viewer.email, role: 'viewer' }).expect(201);
    const columnId = board.columns[0].id;
    const task = await createTask(owner, columnId, 'Задача');

    // Наблюдатель
    await viewer.get(`/api/boards/${board.id}`).expect(200);
    await viewer.patch(`/api/tasks/${task.id}`, { title: 'Нельзя' }).expect(403);
    await viewer.post(`/api/columns/${columnId}/tasks`, { title: 'Нельзя' }).expect(403);
    await viewer.patch(`/api/tasks/${task.id}/move`, { columnId, position: 0 }).expect(403);

    // Редактор
    await editor.patch(`/api/tasks/${task.id}`, { title: 'Можно' }).expect(200);
    await editor.post(`/api/boards/${board.id}/columns`, { title: 'Новая' }).expect(201);
    await editor.patch(`/api/boards/${board.id}`, { title: 'Нельзя' }).expect(403);
    await editor.delete(`/api/boards/${board.id}`).expect(403);
    await editor.post(`/api/boards/${board.id}/members`, { email: owner.email, role: 'editor' }).expect(403);
  });
});
