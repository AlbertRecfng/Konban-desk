import { useState } from 'react';

interface Props {
  taskCount: number;
  wipLimit: number | null;
  editable: boolean;
  onSave: (limit: number | null) => unknown;
}

export type WipState = 'ok' | 'full' | 'over';

export function wipState(taskCount: number, wipLimit: number | null): WipState {
  if (wipLimit === null || taskCount < wipLimit) return 'ok';
  return taskCount === wipLimit ? 'full' : 'over';
}

const STATE_STYLES: Record<WipState, string> = {
  ok: 'bg-slate-300/70 text-slate-600',
  full: 'bg-amber-200 text-amber-900',
  over: 'bg-red-600 text-white',
};

const STATE_TITLES: Record<WipState, string> = {
  ok: 'Задач в колонке',
  full: 'Лимит задач достигнут: новые задачи сюда не добавить',
  over: 'Задач больше лимита: сначала завершите лишние',
};

/** Счётчик задач колонки «N / лимит». По клику (у редактора) превращается в поле для лимита. */
export function WipLimitBadge({ taskCount, wipLimit, editable, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const state = wipState(taskCount, wipLimit);
  const label = wipLimit === null ? String(taskCount) : `${taskCount} / ${wipLimit}`;
  const badgeClass = `rounded-full px-2 text-xs font-medium ${STATE_STYLES[state]}`;

  if (draft === null) {
    if (!editable) {
      return (
        <span className={badgeClass} title={STATE_TITLES[state]}>
          {label}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={`${badgeClass} hover:ring-2 hover:ring-indigo-300`}
        title={`${STATE_TITLES[state]}. Нажмите, чтобы изменить лимит`}
        onClick={() => setDraft(wipLimit === null ? '' : String(wipLimit))}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {label}
      </button>
    );
  }

  function commit() {
    const value = draft?.trim() ?? '';
    setDraft(null);
    const next = value === '' ? null : Number(value);
    if (next !== null && (!Number.isInteger(next) || next < 1)) return;
    if (next !== wipLimit) void onSave(next);
  }

  return (
    <input
      autoFocus
      type="number"
      min={1}
      max={100}
      placeholder="∞"
      title="Лимит задач (пусто - без ограничения)"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        // Не даём Enter/пробелу всплыть до заголовка колонки, где они запускают перетаскивание
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="w-14 rounded border border-indigo-400 bg-white px-1 text-xs outline-none ring-2 ring-indigo-500/20"
    />
  );
}
