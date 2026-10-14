import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { boardsApi } from '../api';
import { errorMessage } from '../api/client';
import { useBoardEvents } from '../api/realtime';
import type { BoardSummary } from '../api/types';
import { Button, ErrorMessage, Input, Label, Modal, Spinner, Textarea } from '../components/ui';
import { ROLE_LABELS, plural } from '../utils/format';

export function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    boardsApi
      .list()
      .then(setBoards)
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(load, [load]);
  // Пригласили на доску, её переименовали или удалили, изменилось число задач - обновляем список
  useBoardEvents(load);

  async function handleDelete(board: BoardSummary) {
    if (!confirm(`Удалить доску «${board.title}» со всеми колонками и задачами?`)) return;
    try {
      await boardsApi.remove(board.id);
      setBoards((prev) => prev?.filter((b) => b.id !== board.id) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Мои доски</h1>
        <Button onClick={() => setCreating(true)}>+ Новая доска</Button>
      </div>

      <ErrorMessage>{error}</ErrorMessage>

      {!boards && !error && <Spinner />}

      {boards?.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-slate-300 p-10 text-center text-slate-500">
          <p className="mb-3">У вас пока нет досок</p>
          <Button onClick={() => setCreating(true)}>Создать первую доску</Button>
        </div>
      )}

      {boards && boards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => (
            <Link
              key={board.id}
              to={`/boards/${board.id}`}
              className="group relative flex min-h-32 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <h2 className="pr-8 font-semibold text-slate-800 group-hover:text-indigo-700">{board.title}</h2>
              {board.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{board.description}</p>}
              <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-500">
                <span>
                  {board.taskCount} {plural(board.taskCount, ['задача', 'задачи', 'задач'])}
                </span>
                <span>{ROLE_LABELS[board.role]}</span>
              </div>
              {board.role === 'owner' && (
                <button
                  type="button"
                  title="Удалить доску"
                  className="absolute top-3 right-3 rounded p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 focus:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete(board);
                  }}
                >
                  🗑
                </button>
              )}
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <CreateBoardModal
          onClose={() => setCreating(false)}
          onCreated={(board) => {
            setBoards((prev) => [board, ...(prev ?? [])]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function CreateBoardModal({ onClose, onCreated }: { onClose: () => void; onCreated: (board: BoardSummary) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      onCreated(await boardsApi.create(title.trim(), description.trim()));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Новая доска" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="board-title">Название</Label>
          <Input id="board-title" autoFocus required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="board-description">Описание</Label>
          <Textarea
            id="board-description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">Будут созданы колонки «К выполнению», «В работе», «Готово».</p>
        <ErrorMessage>{error}</ErrorMessage>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
