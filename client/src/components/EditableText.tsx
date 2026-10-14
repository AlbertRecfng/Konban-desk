import { useState } from 'react';

interface Props {
  value: string;
  onSave: (value: string) => unknown;
  editable: boolean;
  maxLength: number;
  className?: string;
  inputClassName?: string;
}

/** Текст, который по клику превращается в поле ввода. Enter или потеря фокуса сохраняет, Esc отменяет. */
export function EditableText({ value, onSave, editable, maxLength, className = '', inputClassName = '' }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    if (!editable) return <span className={className}>{value}</span>;
    return (
      <button
        type="button"
        title="Нажмите, чтобы переименовать"
        className={`cursor-text truncate rounded px-1 -mx-1 text-left hover:bg-slate-200/70 ${className}`}
        onClick={() => setDraft(value)}
        // Не даём Enter/пробелу всплыть до заголовка колонки, где они запускают перетаскивание
        onKeyDown={(e) => e.stopPropagation()}
      >
        {value}
      </button>
    );
  }

  function commit() {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== value) void onSave(next);
  }

  return (
    <input
      autoFocus
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className={`min-w-0 rounded border border-indigo-400 bg-white px-1 -mx-1 outline-none ring-2 ring-indigo-500/20 ${inputClassName}`}
    />
  );
}
