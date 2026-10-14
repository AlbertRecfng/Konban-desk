import type { Priority, Role } from '../api/types';

/** plural(5, ['задача', 'задачи', 'задач']) → 'задач' */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

/** Сегодняшняя дата в формате ГГГГ-ММ-ДД по местному времени */
export function todayIso(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function formatDate(isoDate: string): string {
  // Без указания времени Date разобрал бы строку как UTC и мог сдвинуть день
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Владелец',
  editor: 'Редактор',
  viewer: 'Только просмотр',
};
