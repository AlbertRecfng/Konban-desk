import { describe, expect, it } from 'vitest';
import {
  type TestUser,
  createBoard,
  createTask,
  createUser,
  expectContiguousPositions,
  getBoard,
  titlesByColumn,
} from './helpers.js';

/** Доска: в первой колонке A B C D, во второй X Y, третья пустая */
async function setup() {
  const user = await createUser();
  const board = await createBoard(user);
  const [todo, doing] = board.columns;
  const ids: Record<string, number> = {};
  for (const title of ['A', 'B', 'C', 'D']) ids[title] = (await createTask(user, todo.id, title)).id;
  for (const title of ['X', 'Y']) ids[title] = (await createTask(user, doing.id, title)).id;
  return { user, board, ids, columns: board.columns.map((c) => c.id) };
}

const move = (user: TestUser, taskId: number, columnId: number, position: number) =>
  user.patch(`/api/tasks/${taskId}/move`, { columnId, position });

describe('Порядок задач', () => {
  it('новые задачи добавляются в конец колонки', async () => {
    const { user, board } = await setup();
    const details = await getBoard(user, board.id);
    expect(titlesByColumn(details)).toEqual([['A', 'B', 'C', 'D'], ['X', 'Y'], []]);
    expectContiguousPositions(details);
  });

  it('перенос вниз и вверх внутри колонки', async () => {
    const { user, board, ids, columns } = await setup();
    await move(user, ids.A, columns[0], 2).expect(200);
    expect(titlesByColumn(await getBoard(user, board.id))[0]).toEqual(['B', 'C', 'A', 'D']);

    await move(user, ids.D, columns[0], 0).expect(200);
    const details = await getBoard(user, board.id);
    expect(titlesByColumn(details)[0]).toEqual(['D', 'B', 'C', 'A']);
    expectContiguousPositions(details);
  });

  it('перенос в другую колонку закрывает «дыру» и раздвигает задачи', async () => {
    const { user, board, ids, columns } = await setup();
    await move(user, ids.B, columns[1], 1).expect(200);
    await move(user, ids.C, columns[2], 0).expect(200);

    const details = await getBoard(user, board.id);
    expect(titlesByColumn(details)).toEqual([['A', 'D'], ['X', 'B', 'Y'], ['C']]);
    expectContiguousPositions(details);
  });

  it('слишком большая позиция означает «в конец»', async () => {
    const { user, board, ids, columns } = await setup();
    const res = await move(user, ids.A, columns[1], 999).expect(200);
    expect(res.body.position).toBe(2);
    expect(titlesByColumn(await getBoard(user, board.id))[1]).toEqual(['X', 'Y', 'A']);
  });

  it('нельзя перенести задачу в колонку другой доски', async () => {
    const { user, ids } = await setup();
    const other = await createBoard(user, 'Другая');
    await move(user, ids.A, other.columns[0].id, 0).expect(400);
  });

  it('удаление задачи сдвигает следующие', async () => {
    const { user, board, ids } = await setup();
    await user.delete(`/api/tasks/${ids.B}`).expect(204);
    const details = await getBoard(user, board.id);
    expect(titlesByColumn(details)[0]).toEqual(['A', 'C', 'D']);
    expectContiguousPositions(details);
  });

  it('одновременные переносы не ломают порядок (блокировки в транзакциях)', async () => {
    const { user, board, ids, columns } = await setup();
    // Восемь запросов одновременно гоняют задачи между колонками
    await Promise.all([
      move(user, ids.A, columns[1], 0),
      move(user, ids.X, columns[0], 0),
      move(user, ids.B, columns[2], 0),
      move(user, ids.Y, columns[2], 0),
      move(user, ids.C, columns[1], 1),
      move(user, ids.D, columns[0], 0),
      move(user, ids.A, columns[2], 5),
      move(user, ids.X, columns[1], 0),
    ]);

    const details = await getBoard(user, board.id);
    expectContiguousPositions(details);
    expect(titlesByColumn(details).flat().sort()).toEqual(['A', 'B', 'C', 'D', 'X', 'Y']);
  });
});

describe('Порядок колонок', () => {
  it('перенос и удаление колонки сохраняют позиции подряд', async () => {
    const user = await createUser();
    const board = await createBoard(user);
    const [todo, , done] = board.columns;

    await user.patch(`/api/columns/${done.id}/move`, { position: 0 }).expect(200);
    let details = await getBoard(user, board.id);
    expect(details.columns.map((c) => c.title)).toEqual(['Готово', 'К выполнению', 'В работе']);

    await user.delete(`/api/columns/${todo.id}`).expect(204);
    details = await getBoard(user, board.id);
    expect(details.columns.map((c) => c.title)).toEqual(['Готово', 'В работе']);
    const positions = (await user.get(`/api/boards/${board.id}`)).body.columns.map((c: { position: number }) => c.position);
    expect(positions).toEqual([0, 1]);
  });
});
