import type { Column, Member, Priority } from '../../api/types';
import { PRIORITY_LABELS, todayIso } from '../../utils/format';

export interface Filters {
  query: string;
  priority: Priority | '';
  /** 'all' - все, 'me' - мои, 'none' - без исполнителя, иначе id участника */
  assignee: string;
  overdueOnly: boolean;
}

export const EMPTY_FILTERS: Filters = { query: '', priority: '', assignee: 'all', overdueOnly: false };

export function isFilterActive(f: Filters): boolean {
  return f.query.trim() !== '' || f.priority !== '' || f.assignee !== 'all' || f.overdueOnly;
}

/** Оставляет в колонках только подходящие задачи; сами колонки не скрываются. */
export function applyFilters(columns: Column[], f: Filters, currentUserId: number): Column[] {
  if (!isFilterActive(f)) return columns;
  const query = f.query.trim().toLowerCase();
  const today = todayIso();

  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      if (query && !`${task.title}\n${task.description}`.toLowerCase().includes(query)) return false;
      if (f.priority && task.priority !== f.priority) return false;
      if (f.assignee === 'me' && task.assigneeId !== currentUserId) return false;
      if (f.assignee === 'none' && task.assigneeId !== null) return false;
      if (/^\d+$/.test(f.assignee) && task.assigneeId !== Number(f.assignee)) return false;
      if (f.overdueOnly && !(task.dueDate !== null && task.dueDate < today)) return false;
      return true;
    }),
  }));
}

const CONTROL_CLASS =
  'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

interface Props {
  filters: Filters;
  onChange: (filters: Filters) => void;
  members: Member[];
  shownCount: number;
  totalCount: number;
  dragDisabledHint: boolean;
}

export function BoardFilters({ filters, onChange, members, shownCount, totalCount, dragDisabledHint }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const active = isFilterActive(filters);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white/60 px-4 py-2">
      <input
        type="search"
        placeholder="Поиск по задачам…"
        value={filters.query}
        onChange={(e) => set({ query: e.target.value })}
        className={`${CONTROL_CLASS} w-56`}
        aria-label="Поиск по задачам"
      />
      <select
        value={filters.priority}
        onChange={(e) => set({ priority: e.target.value as Priority | '' })}
        className={CONTROL_CLASS}
        aria-label="Приоритет"
      >
        <option value="">Любой приоритет</option>
        {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
      <select
        value={filters.assignee}
        onChange={(e) => set({ assignee: e.target.value })}
        className={CONTROL_CLASS}
        aria-label="Исполнитель"
      >
        <option value="all">Все исполнители</option>
        <option value="me">Мои задачи</option>
        <option value="none">Без исполнителя</option>
        {members.map((m) => (
          <option key={m.userId} value={String(m.userId)}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={filters.overdueOnly}
          onChange={(e) => set({ overdueOnly: e.target.checked })}
          className="h-4 w-4 accent-indigo-600"
        />
        Просроченные
      </label>
      {active && (
        <>
          <span className="text-sm text-slate-500">
            Найдено: {shownCount} из {totalCount}
          </span>
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-sm text-indigo-600 hover:underline">
            Сбросить
          </button>
          {dragDisabledHint && (
            <span className="text-xs text-slate-400">Перетаскивание недоступно, пока включён фильтр</span>
          )}
        </>
      )}
    </div>
  );
}
