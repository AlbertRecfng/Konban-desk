import { useCallback, useEffect, useRef, useState } from 'react';
import { boardsApi } from '../api';
import { ApiError, errorMessage, mutationState, onMutationsIdle } from '../api/client';
import { useBoardEvents } from '../api/realtime';
import type { BoardDetails } from '../api/types';

/**
 * Загружает доску и держит её актуальной: когда другой участник что-то меняет,
 * сервер присылает событие, и доска перезагружается.
 *
 * Перезагрузка откладывается, пока пользователь тянет карточку или пока не пришли ответы
 * на его собственные изменения. Иначе ответ с более старым состоянием затёр бы
 * только что перенесённую карточку.
 */
export function useLiveBoard(boardId: number) {
  const [board, setBoard] = useState<BoardDetails | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const dragging = useRef(false);
  const queued = useRef(false);
  const currentBoardId = useRef(boardId);

  useEffect(() => {
    currentBoardId.current = boardId;
    let cancelled = false;
    setBoard(null);
    setLoadError(null);
    boardsApi
      .get(boardId)
      .then((data) => !cancelled && setBoard(data))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err : new ApiError(0, errorMessage(err))));
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const reload = useCallback(async () => {
    if (dragging.current || mutationState().inFlight > 0) {
      queued.current = true;
      return;
    }
    queued.current = false;
    const id = currentBoardId.current;
    const startedBefore = mutationState().started;

    let data: BoardDetails;
    try {
      data = await boardsApi.get(id);
    } catch (err) {
      // Доску удалили или нас из неё исключили
      if (err instanceof ApiError && err.status === 404 && id === currentBoardId.current) setLoadError(err);
      return;
    }
    if (id !== currentBoardId.current) return;
    // Пока шёл запрос, пользователь сам что-то изменил - ответ мог устареть, повторим позже
    if (mutationState().started !== startedBefore || dragging.current) {
      queued.current = true;
      if (!dragging.current && mutationState().inFlight === 0) void reload();
      return;
    }
    setBoard(data);
  }, []);

  const flushQueued = useCallback(() => {
    if (queued.current) void reload();
  }, [reload]);

  useEffect(() => onMutationsIdle(flushQueued), [flushQueued]);

  useBoardEvents((event) => {
    if (event.boardId === null || event.boardId === currentBoardId.current) void reload();
  });

  const setDragging = useCallback(
    (active: boolean) => {
      dragging.current = active;
      if (!active) flushQueued();
    },
    [flushQueued],
  );

  return { board, setBoard, loadError, reload, setDragging };
}
