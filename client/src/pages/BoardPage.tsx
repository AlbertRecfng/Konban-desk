import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { boardsApi, columnsApi, tasksApi } from '../api';
import { errorMessage } from '../api/client';
import type { Column, Member, Task, TaskFields } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EditableText } from '../components/EditableText';
import { AddItemForm } from '../components/board/AddItemForm';
import { BoardColumn } from '../components/board/BoardColumn';
import { BoardFilters, EMPTY_FILTERS, type Filters, applyFilters, isFilterActive } from '../components/board/BoardFilters';
import { type ColumnsUpdater, KanbanBoard } from '../components/board/KanbanBoard';
import { MembersModal } from '../components/board/MembersModal';
import { TaskModal } from '../components/board/TaskModal';
import { useLiveBoard } from '../hooks/useLiveBoard';
import { Avatar, Button, ErrorMessage, Spinner } from '../components/ui';
import { ROLE_LABELS, plural } from '../utils/format';

const countTasks = (columns: Column[]) => columns.reduce((sum, c) => sum + c.tasks.length, 0);

export function BoardPage() {
  const boardId = Number(useParams().boardId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { board, setBoard, loadError, reload, setDragging } = useLiveBoard(boardId);
  const [error, setError] = useState('');
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setError('');
    setOpenTaskId(null);
  }, [boardId]);

  const updateColumns: ColumnsUpdater = useCallback(
    (update) => setBoard((prev) => prev && { ...prev, columns: update(prev.columns) }),
    [setBoard],
  );

  const membersById = useMemo(() => new Map((board?.members ?? []).map((m) => [m.userId, m])), [board?.members]);

  /** Выполняет запрос и показывает ошибку над доской. Возвращает false при ошибке. */
  async function attempt(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      setError('');
      return true;
    } catch (err) {
      setError(errorMessage(err));
      // Ошибка могла возникнуть из-за чужого изменения (например, лимит уже занят) - подтягиваем актуальную доску
      void reload();
      return false;
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="mb-4 text-slate-700">
          {loadError.status === 404 ? 'Доска не найдена или у вас нет к ней доступа' : loadError.message}
        </p>
        <Link to="/" className="text-indigo-600 hover:underline">
          ← К списку досок
        </Link>
      </div>
    );
  }
  if (!board || !user) return <Spinner />;

  const canEdit = board.role !== 'viewer';
  const filterActive = isFilterActive(filters);
  const visibleColumns = applyFilters(board.columns, filters, user.id);
  const taskCount = countTasks(board.columns);

  const openTask = openTaskId === null ? null : findTask(board.columns, openTaskId);

  const mapTasks = (fn: (tasks: Task[]) => Task[]) =>
    updateColumns((cols) => cols.map((c) => ({ ...c, tasks: fn(c.tasks) })));

  const setMembers = (members: Member[]) => setBoard((prev) => prev && { ...prev, members });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-white/60 px-4 py-3">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Доски
        </Link>
        <h1 className="flex min-w-0 items-center text-lg font-semibold">
          <EditableText
            value={board.title}
            editable={board.role === 'owner'}
            maxLength={100}
            onSave={(title) =>
              attempt(async () => {
                const updated = await boardsApi.update(board.id, { title });
                setBoard((prev) => prev && { ...prev, title: updated.title });
              })
            }
          />
        </h1>
        <span className="text-sm text-slate-500">
          {taskCount} {plural(taskCount, ['задача', 'задачи', 'задач'])}
        </span>
        {board.role !== 'owner' && (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">{ROLE_LABELS[board.role]}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {board.members.slice(0, 5).map((m) => (
              <span key={m.userId} className="rounded-full ring-2 ring-white">
                <Avatar name={m.name} id={m.userId} />
              </span>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setMembersOpen(true)}>
            Участники ({board.members.length})
          </Button>
        </div>
      </div>

      <BoardFilters
        filters={filters}
        onChange={setFilters}
        members={board.members}
        shownCount={countTasks(visibleColumns)}
        totalCount={taskCount}
        dragDisabledHint={canEdit}
      />

      {error && (
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
          <div className="flex-1">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setError('')} aria-label="Скрыть">
            ×
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <KanbanBoard
          columns={visibleColumns}
          updateColumns={updateColumns}
          membersById={membersById}
          dragEnabled={canEdit && !filterActive}
          onError={(message) => {
            setError(message);
            void reload();
          }}
          onDragActiveChange={setDragging}
          renderColumn={(column, { dropBlocked }) => (
            <BoardColumn
              key={column.id}
              column={column}
              taskCount={board.columns.find((c) => c.id === column.id)?.tasks.length ?? 0}
              dropBlocked={dropBlocked}
              membersById={membersById}
              canEdit={canEdit}
              canDrag={canEdit && !filterActive}
              onOpenTask={(task) => setOpenTaskId(task.id)}
              onRename={(title) =>
                attempt(async () => {
                  const updated = await columnsApi.update(column.id, { title });
                  updateColumns((cols) => cols.map((c) => (c.id === column.id ? { ...c, title: updated.title } : c)));
                })
              }
              onChangeWipLimit={(wipLimit) =>
                attempt(async () => {
                  const updated = await columnsApi.update(column.id, { wipLimit });
                  updateColumns((cols) => cols.map((c) => (c.id === column.id ? { ...c, wipLimit: updated.wipLimit } : c)));
                })
              }
              onDelete={() => {
                // Считаем по полной колонке: при включённом фильтре видна только часть задач
                const n = board.columns.find((c) => c.id === column.id)?.tasks.length ?? 0;
                const warning = n ? ` Вместе с ней будет удалено ${n} ${plural(n, ['задача', 'задачи', 'задач'])}.` : '';
                if (!confirm(`Удалить колонку «${column.title}»?${warning}`)) return;
                void attempt(async () => {
                  await columnsApi.remove(column.id);
                  updateColumns((cols) => cols.filter((c) => c.id !== column.id));
                });
              }}
              onAddTask={(title) =>
                attempt(async () => {
                  const task = await columnsApi.addTask(column.id, { title });
                  updateColumns((cols) => cols.map((c) => (c.id === column.id ? { ...c, tasks: [...c.tasks, task] } : c)));
                })
              }
            />
          )}
          trailing={
            canEdit && (
              <div className="w-72 shrink-0 rounded-lg bg-slate-200/40 p-2">
                <AddItemForm
                  buttonLabel="Добавить колонку"
                  placeholder="Название колонки"
                  submitLabel="Добавить"
                  maxLength={100}
                  onSubmit={(title) =>
                    attempt(async () => {
                      const column = await boardsApi.addColumn(board.id, title);
                      updateColumns((cols) => [...cols, { ...column, tasks: [] }]);
                    })
                  }
                />
              </div>
            )
          }
        />
      </div>

      {openTask && (
        <TaskModal
          key={openTask.task.id}
          task={openTask.task}
          columnTitle={openTask.column.title}
          members={board.members}
          canEdit={canEdit}
          onClose={() => setOpenTaskId(null)}
          onSave={async (fields: TaskFields) => {
            const updated = await tasksApi.update(openTask.task.id, fields);
            mapTasks((tasks) => tasks.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
          }}
          onDelete={async () => {
            await tasksApi.remove(openTask.task.id);
            mapTasks((tasks) => tasks.filter((t) => t.id !== openTask.task.id));
          }}
        />
      )}

      {membersOpen && (
        <MembersModal
          boardId={board.id}
          members={board.members}
          currentUserId={user.id}
          isOwner={board.role === 'owner'}
          onMembersChange={setMembers}
          onMemberRemoved={(userId) =>
            mapTasks((tasks) => tasks.map((t) => (t.assigneeId === userId ? { ...t, assigneeId: null } : t)))
          }
          onLeave={() => navigate('/', { replace: true })}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </div>
  );
}

function findTask(columns: Column[], taskId: number): { task: Task; column: Column } | null {
  for (const column of columns) {
    const task = column.tasks.find((t) => t.id === taskId);
    if (task) return { task, column };
  }
  return null;
}
