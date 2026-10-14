import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Member, Task } from '../../api/types';
import { PRIORITY_LABELS, PRIORITY_STYLES, formatDate, todayIso } from '../../utils/format';
import { Avatar } from '../ui';
import { taskDndId } from './dndIds';

/** Внешний вид карточки, без логики перетаскивания (используется и в DragOverlay). */
export function TaskCardView({ task, assignee, dragging = false }: { task: Task; assignee?: Member; dragging?: boolean }) {
  const overdue = task.dueDate !== null && task.dueDate < todayIso();

  return (
    <div
      className={`rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm ${
        dragging ? 'rotate-2 shadow-lg ring-2 ring-indigo-400' : 'hover:border-slate-300'
      }`}
    >
      <p className="break-words font-medium text-slate-800">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_STYLES[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueDate && (
          <span
            className={`rounded px-1.5 py-0.5 ${overdue ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            title={overdue ? 'Срок истёк' : 'Срок выполнения'}
          >
            📅 {formatDate(task.dueDate)}
          </span>
        )}
        {task.description && (
          <span className="text-slate-400" title="Есть описание">
            ☰
          </span>
        )}
        {assignee && (
          <span className="ml-auto">
            <Avatar name={assignee.name} id={assignee.userId} />
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  task: Task;
  assignee?: Member;
  canDrag: boolean;
  onOpen: (task: Task) => void;
}

export function SortableTaskCard({ task, assignee, canDrag, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    disabled: !canDrag,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md ${
        isDragging ? 'opacity-40' : ''
      }`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        // Пробел запускает перетаскивание с клавиатуры, Enter открывает задачу
        if (e.key === 'Enter') onOpen(task);
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TaskCardView task={task} assignee={assignee} />
    </li>
  );
}
