import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { type ReactNode, useRef, useState } from 'react';
import { columnsApi, tasksApi } from '../../api';
import { errorMessage } from '../../api/client';
import type { Column, Member, Task } from '../../api/types';
import { ColumnDragPreview } from './BoardColumn';
import { columnDndId, parseDndId } from './dndIds';
import { TaskCardView } from './TaskCard';

export type ColumnsUpdater = (update: (columns: Column[]) => Column[]) => void;

interface Props {
  columns: Column[];
  updateColumns: ColumnsUpdater;
  membersById: Map<number, Member>;
  dragEnabled: boolean;
  onError: (message: string) => void;
  /** Начало и конец перетаскивания: пока тянут карточку, доску нельзя перезагружать */
  onDragActiveChange: (active: boolean) => void;
  renderColumn: (column: Column, state: { dropBlocked: boolean }) => ReactNode;
  /** Элемент в конце ряда колонок (форма добавления колонки) */
  trailing?: ReactNode;
}

const columnIndexOfTask = (columns: Column[], taskId: number) =>
  columns.findIndex((c) => c.tasks.some((t) => t.id === taskId));

/**
 * Доска с перетаскиванием. Изменения применяются к интерфейсу сразу (оптимистично),
 * а затем отправляются на сервер; при ошибке доска возвращается к состоянию до перетаскивания.
 *
 * Перенос задачи между колонками выполняется уже во время перетаскивания (onDragOver),
 * чтобы карточка «раздвигала» задачи в новой колонке. Порядок внутри колонки
 * окончательно фиксируется в onDragEnd.
 */
export function KanbanBoard({
  columns,
  updateColumns,
  membersById,
  dragEnabled,
  onError,
  onDragActiveChange,
  renderColumn,
  trailing,
}: Props) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  /** Колонка, куда тянут карточку, но она заполнена (WIP-лимит) */
  const [blockedColumnId, setBlockedColumnId] = useState<number | null>(null);
  const snapshot = useRef<Column[]>([]);
  const dragStart = useRef<{ columnId: number; index: number } | null>(null);

  const sensors = useSensors(
    // Перетаскивание начинается после сдвига на 5px, иначе это обычный клик (открыть задачу)
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Колонку сравниваем только с колонками. Для задачи сначала ищем колонку под курсором,
   * затем ближайшую задачу в ней; если колонка пуста, целью становится сама колонка.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const active = parseDndId(args.active.id);
    const columnContainers = args.droppableContainers.filter((c) => parseDndId(c.id).type === 'column');
    if (active.type === 'column') return closestCenter({ ...args, droppableContainers: columnContainers });

    const columnHit = pointerWithin({ ...args, droppableContainers: columnContainers })[0];
    if (!columnHit) return [];
    const column = columns.find((c) => c.id === parseDndId(columnHit.id).id);
    const taskIds = new Set(column?.tasks.map((t) => t.id));
    const taskContainers = args.droppableContainers.filter((c) => {
      const parsed = parseDndId(c.id);
      return parsed.type === 'task' && taskIds.has(parsed.id);
    });
    return taskContainers.length ? closestCenter({ ...args, droppableContainers: taskContainers }) : [columnHit];
  };

  function handleDragStart({ active }: DragStartEvent) {
    onDragActiveChange(true);
    setActiveId(active.id);
    snapshot.current = columns;
    const { type, id } = parseDndId(active.id);
    if (type === 'task') {
      const colIndex = columnIndexOfTask(columns, id);
      dragStart.current = {
        columnId: columns[colIndex].id,
        index: columns[colIndex].tasks.findIndex((t) => t.id === id),
      };
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    const dragged = parseDndId(active.id);
    if (!over || dragged.type !== 'task') return;
    const target = parseDndId(over.id);

    const fromIndex = columnIndexOfTask(columns, dragged.id);
    const toIndex =
      target.type === 'column' ? columns.findIndex((c) => c.id === target.id) : columnIndexOfTask(columns, target.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      setBlockedColumnId(null);
      return;
    }

    // WIP-лимит: в заполненную колонку карточка не встаёт, колонка подсвечивается
    const { wipLimit, tasks: targetColumnTasks } = columns[toIndex];
    if (wipLimit !== null && targetColumnTasks.length >= wipLimit) {
      setBlockedColumnId(columns[toIndex].id);
      return;
    }
    setBlockedColumnId(null);

    // Вставляем перед задачей под курсором или после неё, если курсор ниже её середины
    const targetTasks = columns[toIndex].tasks;
    let insertAt = targetTasks.length;
    if (target.type === 'task') {
      const overIndex = targetTasks.findIndex((t) => t.id === target.id);
      const draggedRect = active.rect.current.translated;
      const isBelow = draggedRect !== null && draggedRect.top > over.rect.top + over.rect.height / 2;
      insertAt = overIndex + (isBelow ? 1 : 0);
    }

    updateColumns((cols) => {
      const task = cols[fromIndex].tasks.find((t) => t.id === dragged.id);
      if (!task) return cols;
      return cols.map((col, i) => {
        if (i === fromIndex) return { ...col, tasks: col.tasks.filter((t) => t.id !== dragged.id) };
        if (i === toIndex) {
          const tasks = [...col.tasks];
          tasks.splice(insertAt, 0, { ...task, columnId: col.id });
          return { ...col, tasks };
        }
        return col;
      });
    });
  }

  function rollback(error: unknown) {
    updateColumns(() => snapshot.current);
    onError(errorMessage(error));
  }

  function handleDragEnd(event: DragEndEvent) {
    try {
      finishDrag(event);
    } finally {
      onDragActiveChange(false);
    }
  }

  function finishDrag({ active, over }: DragEndEvent) {
    setActiveId(null);
    setBlockedColumnId(null);
    const dragged = parseDndId(active.id);
    if (!over) {
      updateColumns(() => snapshot.current);
      return;
    }
    const target = parseDndId(over.id);

    if (dragged.type === 'column') {
      const from = columns.findIndex((c) => c.id === dragged.id);
      const to = columns.findIndex((c) => c.id === target.id);
      if (from === to || to < 0) return;
      updateColumns((cols) => arrayMove(cols, from, to));
      columnsApi.move(dragged.id, to).catch(rollback);
      return;
    }

    // Перестановка внутри колонки (перенос в другую колонку уже сделан в onDragOver)
    let next = columns;
    const colIndex = columnIndexOfTask(next, dragged.id);
    if (colIndex < 0) return;
    if (target.type === 'task' && target.id !== dragged.id && columnIndexOfTask(next, target.id) === colIndex) {
      const tasks = next[colIndex].tasks;
      const oldIndex = tasks.findIndex((t) => t.id === dragged.id);
      const newIndex = tasks.findIndex((t) => t.id === target.id);
      next = next.map((col, i) => (i === colIndex ? { ...col, tasks: arrayMove(tasks, oldIndex, newIndex) } : col));
      updateColumns(() => next);
    }

    const finalColumn = next[colIndex];
    const finalIndex = finalColumn.tasks.findIndex((t) => t.id === dragged.id);
    const start = dragStart.current;
    if (start && start.columnId === finalColumn.id && start.index === finalIndex) return;
    tasksApi.move(dragged.id, finalColumn.id, finalIndex).catch(rollback);
  }

  function handleDragCancel() {
    setActiveId(null);
    setBlockedColumnId(null);
    updateColumns(() => snapshot.current);
    onDragActiveChange(false);
  }

  const active = activeId === null ? null : parseDndId(activeId);
  let overlay: ReactNode = null;
  if (active?.type === 'column') {
    const column = columns.find((c) => c.id === active.id);
    if (column) overlay = <ColumnDragPreview column={column} />;
  } else if (active?.type === 'task') {
    const task: Task | undefined = columns.flatMap((c) => c.tasks).find((t) => t.id === active.id);
    if (task) {
      const assignee = task.assigneeId === null ? undefined : membersById.get(task.assigneeId);
      overlay = <TaskCardView task={task} assignee={assignee} dragging />;
    }
  }

  return (
    <DndContext
      sensors={dragEnabled ? sensors : []}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
        <SortableContext items={columns.map((c) => columnDndId(c.id))} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => renderColumn(column, { dropBlocked: column.id === blockedColumnId }))}
        </SortableContext>
        {trailing}
      </div>
      <DragOverlay>{overlay}</DragOverlay>
    </DndContext>
  );
}
