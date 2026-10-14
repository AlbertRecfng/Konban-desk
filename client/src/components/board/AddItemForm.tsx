import { type FormEvent, useState } from 'react';
import { Button } from '../ui';

interface Props {
  buttonLabel: string;
  placeholder: string;
  submitLabel: string;
  maxLength: number;
  /** Вернуть false, если добавить не удалось: тогда введённый текст сохранится */
  onSubmit: (title: string) => Promise<boolean>;
  className?: string;
}

/** Кнопка «+ Добавить …», которая раскрывается в поле ввода. После добавления поле остаётся открытым. */
export function AddItemForm({ buttonLabel, placeholder, submitLabel, maxLength, onSubmit, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" className={`w-full justify-start ${className}`} onClick={() => setOpen(true)}>
        + {buttonLabel}
      </Button>
    );
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const value = title.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      if (await onSubmit(value)) setTitle('');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    setTitle('');
  }

  return (
    <form onSubmit={handleSubmit} className={`space-y-2 ${className}`}>
      <textarea
        autoFocus
        rows={2}
        value={title}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
          }
          if (e.key === 'Escape') close();
        }}
        className="w-full resize-none rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || !title.trim()}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={close}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
