import { type FormEvent, useState } from 'react';
import { errorMessage } from '../../api/client';
import type { Member, Priority, Task, TaskFields } from '../../api/types';
import { PRIORITY_LABELS, formatDateTime } from '../../utils/format';
import { Button, ErrorMessage, Input, Label, Modal, Textarea } from '../ui';

const SELECT_CLASS =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100';

interface Props {
  task: Task;
  columnTitle: string;
  members: Member[];
  canEdit: boolean;
  onSave: (fields: TaskFields) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function TaskModal({ task, columnTitle, members, canEdit, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() => onSave({ title: title.trim(), description, priority, dueDate: dueDate || null, assigneeId }));
  }

  function handleDelete() {
    if (confirm(`Удалить задачу «${task.title}»?`)) void run(onDelete);
  }

  return (
    <Modal title={canEdit ? 'Редактирование задачи' : 'Задача'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-slate-500">
          В колонке «{columnTitle}» · создана {formatDateTime(task.createdAt)}
        </p>
        <fieldset disabled={!canEdit || busy} className="space-y-4">
          <div>
            <Label htmlFor="task-title">Название</Label>
            <Input id="task-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="task-description">Описание</Label>
            <Textarea
              id="task-description"
              rows={5}
              maxLength={10_000}
              placeholder={canEdit ? 'Подробности задачи…' : 'Нет описания'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="task-priority">Приоритет</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={SELECT_CLASS}
              >
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="task-due">Срок</Label>
              <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="task-assignee">Исполнитель</Label>
            <select
              id="task-assignee"
              value={assigneeId ?? ''}
              onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
              className={SELECT_CLASS}
            >
              <option value="">Не назначен</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <ErrorMessage>{error}</ErrorMessage>

        {canEdit && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="ghost" className="text-red-600 hover:bg-red-50" disabled={busy} onClick={handleDelete}>
              Удалить
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Отмена
              </Button>
              <Button type="submit" disabled={busy || !title.trim()}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
