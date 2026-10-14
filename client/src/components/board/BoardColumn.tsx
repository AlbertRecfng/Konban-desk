import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Column, Member, Task } from '../../api/types';
import { EditableText } from '../EditableText';
import { AddItemForm } from './AddItemForm';
import { columnDndId, taskDndId } from './dndIds';
import { SortableTaskCard } from './TaskCard';
import { WipLimitBadge, wipState } from './WipLimitBadge';

interface Props {
  column: Column;
  /** Настоящее число задач: при включённом фильтре в column.tasks видна только часть */
  taskCount: number;
  /** Сейчас сюда тянут карточку, но колонка заполнена */
  dropBlocked: boolean;
  membersById: Map<number, Member>;
  canEdit: boolean;
  /** false, когда включён фильтр: позиции в отфильтрованном списке не совпадают с настоящими */
  canDrag: boolean;
  onRename: (title: string) => Promise<boolean>;
  onChangeWipLimit: (limit: number | null) => Promise<boolean>;
  onDelete: () => void;
  onAddTask: (title: string) => Promise<boolean>;
  onOpenTask: (task: Task) => void;
}

export function BoardColumn({
  column,
  taskCount,
  dropBlocked,
  membersById,
  canEdit,
  canDrag,
  onRename,
  onChangeWipLimit,
  onDelete,
  onAddTask,
  onOpenTask,
}: Props) {
  const wip = wipState(taskCount, column.wipLimit);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDndId(column.id),
    disabled: !canDrag,
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-lg transition-shadow ${
        wip === 'over' ? 'bg-red-100/70' : 'bg-slate-200/60'
      } ${dropBlocked ? 'ring-2 ring-red-500' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* Колонку перетаскивают только за заголовок, чтобы не мешать полям ввода внутри */}
      <header
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className={`flex items-center gap-2 px-3 pt-3 pb-2 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        <h3 className="flex min-w-0 flex-1 items-center text-sm font-semibold text-slate-700">
          <EditableText value={column.title} editable={canEdit} maxLength={100} onSave={onRename} className="min-w-0" inputClassName="w-full" />
        </h3>
        <WipLimitBadge taskCount={taskCount} wipLimit={column.wipLimit} editable={canEdit} onSave={onChangeWipLimit} />
        {canEdit && (
          <button
            type="button"
            title="Удалить колонку"
            onClick={onDelete}
            onKeyDown={(e) => e.stopPropagation()}
            className="rounded px-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
          >
            ×
          </button>
        )}
      </header>

      <SortableContext items={column.tasks.map((t) => taskDndId(t.id))} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-12 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {column.tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              assignee={task.assigneeId === null ? undefined : membersById.get(task.assigneeId)}
              canDrag={canDrag}
              onOpen={onOpenTask}
            />
          ))}
        </ul>
      </SortableContext>

      {dropBlocked && column.wipLimit !== null && (
        <p className="px-3 pb-2 text-xs font-medium text-red-700">Колонка заполнена: лимит {column.wipLimit}</p>
      )}

      {canEdit && wip !== 'ok' && (
        <p className="px-3 pb-3 text-xs text-slate-500">
          {wip === 'full' ? 'Лимит задач достигнут' : 'Задач больше лимита'} - завершите текущие, прежде чем брать новые
        </p>
      )}

      {canEdit && wip === 'ok' && (
        <div className="px-2 pb-2">
          <AddItemForm
            buttonLabel="Добавить задачу"
            placeholder="Название задачи"
            submitLabel="Добавить"
            maxLength={200}
            onSubmit={onAddTask}
          />
        </div>
      )}
    </section>
  );
}

/** Упрощённое изображение колонки, которое тянется за курсором. */
export function ColumnDragPreview({ column }: { column: Column }) {
  return (
    <div className="w-72 rotate-2 rounded-lg bg-slate-200 p-3 shadow-lg ring-2 ring-indigo-400">
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700">
        <span className="truncate">{column.title}</span>
        <span className="rounded-full bg-slate-300 px-2 text-xs">
          {column.wipLimit === null ? column.tasks.length : `${column.tasks.length} / ${column.wipLimit}`}
        </span>
      </div>
    </div>
  );
}
