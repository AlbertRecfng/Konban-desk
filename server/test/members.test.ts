import { describe, expect, it } from 'vitest';
import { createBoard, createTask, createUser, getBoard } from './helpers.js';

describe('Участники доски', () => {
  it('приглашённый видит доску в своём списке', async () => {
    const owner = await createUser('Владелец');
    const guest = await createUser('Гость');
    const board = await createBoard(owner, 'Общая');

    const res = await owner.post(`/api/boards/${board.id}/members`, { email: guest.email, role: 'editor' }).expect(201);
    expect(res.body).toMatchObject({ userId: guest.user.id, name: 'Гость', role: 'editor' });

    const list = await guest.get('/api/boards').expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: board.id, title: 'Общая', role: 'editor' })]);

    const members = await guest.get(`/api/boards/${board.id}/members`).expect(200);
    expect(members.body.map((m: { role: string }) => m.role)).toEqual(['owner', 'editor']);
  });

  it('проверяет приглашение: несуществующий email, повтор, недопустимая роль', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const board = await createBoard(owner);
    const url = `/api/boards/${board.id}/members`;

    await owner.post(url, { email: 'nobody@nowhere.ru', role: 'editor' }).expect(404);
    await owner.post(url, { email: guest.email, role: 'owner' }).expect(400);
    await owner.post(url, { email: guest.email, role: 'viewer' }).expect(201);
    await owner.post(url, { email: guest.email, role: 'editor' }).expect(409);
  });

  it('смена роли сразу меняет права', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const board = await createBoard(owner);
    const columnId = board.columns[0].id;
    await owner.post(`/api/boards/${board.id}/members`, { email: guest.email, role: 'editor' }).expect(201);
    await guest.post(`/api/columns/${columnId}/tasks`, { title: 'Пока можно' }).expect(201);

    await owner.patch(`/api/boards/${board.id}/members/${guest.user.id}`, { role: 'viewer' }).expect(200);
    await guest.post(`/api/columns/${columnId}/tasks`, { title: 'Уже нельзя' }).expect(403);
  });

  it('владельца нельзя понизить или удалить', async () => {
    const owner = await createUser();
    const board = await createBoard(owner);
    await owner.patch(`/api/boards/${board.id}/members/${owner.user.id}`, { role: 'viewer' }).expect(400);
    await owner.delete(`/api/boards/${board.id}/members/${owner.user.id}`).expect(400);
  });

  it('участник может сам покинуть доску, но не удалить другого', async () => {
    const owner = await createUser();
    const a = await createUser();
    const b = await createUser();
    const board = await createBoard(owner);
    for (const u of [a, b]) {
      await owner.post(`/api/boards/${board.id}/members`, { email: u.email, role: 'editor' }).expect(201);
    }

    await a.delete(`/api/boards/${board.id}/members/${b.user.id}`).expect(403);
    await a.delete(`/api/boards/${board.id}/members/${a.user.id}`).expect(204);
    await a.get(`/api/boards/${board.id}`).expect(404);
  });
});

describe('Исполнитель задачи', () => {
  it('исполнителем может быть только участник доски', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const board = await createBoard(owner);
    const task = await createTask(owner, board.columns[0].id, 'Задача');

    const bad = await owner.patch(`/api/tasks/${task.id}`, { assigneeId: stranger.user.id }).expect(400);
    expect(bad.body.error).toMatch(/участником доски/);

    await owner.patch(`/api/tasks/${task.id}`, { assigneeId: owner.user.id }).expect(200);
    const details = await getBoard(owner, board.id);
    expect(details.columns[0].tasks[0].assigneeId).toBe(owner.user.id);

    await owner.patch(`/api/tasks/${task.id}`, { assigneeId: null }).expect(200);
    expect((await getBoard(owner, board.id)).columns[0].tasks[0].assigneeId).toBeNull();
  });

  it('при создании задачи можно сразу назначить исполнителя', async () => {
    const owner = await createUser();
    const board = await createBoard(owner);
    const res = await owner
      .post(`/api/columns/${board.columns[0].id}/tasks`, { title: 'С исполнителем', assigneeId: owner.user.id })
      .expect(201);
    expect(res.body.assigneeId).toBe(owner.user.id);
  });

  it('удалённый с доски участник снимается со всех её задач', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const board = await createBoard(owner);
    await owner.post(`/api/boards/${board.id}/members`, { email: guest.email, role: 'editor' }).expect(201);
    const task = await createTask(owner, board.columns[1].id, 'Задача гостя');
    await owner.patch(`/api/tasks/${task.id}`, { assigneeId: guest.user.id }).expect(200);

    await owner.delete(`/api/boards/${board.id}/members/${guest.user.id}`).expect(204);
    const details = await getBoard(owner, board.id);
    expect(details.columns[1].tasks[0].assigneeId).toBeNull();
  });
});
