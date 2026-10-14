import type { AddressInfo } from 'node:net';
import { type Socket, io as connect } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOCKET_PATH, attachRealtime } from '../src/realtime.js';
import { app, createBoard, createTask, createUser } from './helpers.js';

let baseUrl: string;
const server = app.listen(0);
const sockets: Socket[] = [];

beforeAll(() => {
  attachRealtime(server);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

/** Подключается и запоминает все полученные события board:changed */
async function openSocket(token: string) {
  const socket = connect(baseUrl, { path: SOCKET_PATH, auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const received: number[] = [];
  socket.on('board:changed', (e: { boardId: number }) => received.push(e.boardId));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, received };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('Обновления в реальном времени', () => {
  it('без действующего токена подключиться нельзя', async () => {
    await expect(openSocket('invalid-token')).rejects.toThrow('unauthorized');
  });

  it('участники получают событие, автор изменения и посторонние - нет', async () => {
    const owner = await createUser();
    const member = await createUser();
    const stranger = await createUser();
    const board = await createBoard(owner);
    await owner.post(`/api/boards/${board.id}/members`, { email: member.email, role: 'editor' }).expect(201);
    const task = await createTask(owner, board.columns[0].id, 'Задача');

    const ownerConn = await openSocket(owner.token);
    const memberConn = await openSocket(member.token);
    const strangerConn = await openSocket(stranger.token);

    await owner
      .patch(`/api/tasks/${task.id}/move`, { columnId: board.columns[1].id, position: 0 })
      .set('X-Socket-Id', ownerConn.socket.id!)
      .expect(200);
    await settle();

    expect(memberConn.received).toEqual([board.id]);
    expect(ownerConn.received).toEqual([]);
    expect(strangerConn.received).toEqual([]);
  });

  it('удалённый с доски участник тоже получает событие', async () => {
    const owner = await createUser();
    const member = await createUser();
    const board = await createBoard(owner);
    await owner.post(`/api/boards/${board.id}/members`, { email: member.email, role: 'viewer' }).expect(201);
    const memberConn = await openSocket(member.token);

    await owner.delete(`/api/boards/${board.id}/members/${member.user.id}`).expect(204);
    await settle();
    expect(memberConn.received).toEqual([board.id]);
  });

  it('о новой доске в списке узнаёт приглашённый', async () => {
    const owner = await createUser();
    const guest = await createUser();
    const board = await createBoard(owner);
    const guestConn = await openSocket(guest.token);

    await owner.post(`/api/boards/${board.id}/members`, { email: guest.email, role: 'editor' }).expect(201);
    await settle();
    expect(guestConn.received).toEqual([board.id]);
  });
});
