import { useEffect, useRef, useState } from 'react';
import { type Socket, io } from 'socket.io-client';
import { getAccessToken, refreshSession, setSocketIdProvider } from './client';

/**
 * Подключение к серверу для обновлений в реальном времени.
 * Сервер присылает только «доска N изменилась», а данные страницы загружают сами.
 */

/** boardId === null означает «могли пропустить события» (было переподключение) - обновить всё */
export interface BoardChangedEvent {
  boardId: number | null;
}

type Listener = (event: BoardChangedEvent) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();
const statusListeners = new Set<(connected: boolean) => void>();

function emit(event: BoardChangedEvent) {
  for (const listener of listeners) listener(event);
}

function setConnected(connected: boolean) {
  for (const listener of statusListeners) listener(connected);
}

export function connectRealtime() {
  if (socket) return;
  const current = io({
    path: '/api/socket.io',
    // Функция, а не значение: при переподключении нужен свежий токен
    auth: (cb) => cb({ token: getAccessToken() }),
  });
  socket = current;
  setSocketIdProvider(() => (current.connected ? current.id : undefined));

  let connectedBefore = false;
  current.on('connect', () => {
    setConnected(true);
    // Пока связи не было, события могли потеряться - просим страницы обновиться
    if (connectedBefore) emit({ boardId: null });
    connectedBefore = true;
  });
  current.on('disconnect', () => setConnected(false));
  current.on('board:changed', (event: { boardId: number }) => emit(event));

  // Отказ при подключении (обычно истёк access-токен) Socket.IO сам не повторяет
  current.on('connect_error', async () => {
    setConnected(false);
    if (socket !== current) return;
    const session = await refreshSession();
    if (session && socket === current) setTimeout(() => socket === current && current.connect(), 1000);
  });
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
  setSocketIdProvider(() => undefined);
  setConnected(false);
}

/** Подписка на изменения досок. Обработчик можно передавать без useCallback. */
export function useBoardEvents(handler: Listener) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const listener: Listener = (event) => latest.current(event);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}

export function useRealtimeStatus(): boolean {
  const [connected, setConnectedState] = useState(() => socket?.connected ?? false);
  useEffect(() => {
    statusListeners.add(setConnectedState);
    setConnectedState(socket?.connected ?? false);
    return () => {
      statusListeners.delete(setConnectedState);
    };
  }, []);
  return connected;
}
