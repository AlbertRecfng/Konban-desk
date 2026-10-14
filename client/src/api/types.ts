// Типы ответов API (совпадают с полями, которые возвращает сервер)

export type Role = 'owner' | 'editor' | 'viewer';
export type Priority = 'low' | 'medium' | 'high';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface Member {
  userId: number;
  name: string;
  email: string;
  role: Role;
  addedAt: string;
}

export interface BoardSummary {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  role: Role;
  taskCount: number;
}

export interface Task {
  id: number;
  columnId: number;
  title: string;
  description: string;
  priority: Priority;
  /** Дата в формате ГГГГ-ММ-ДД */
  dueDate: string | null;
  assigneeId: number | null;
  position: number;
  createdAt: string;
}

export interface Column {
  id: number;
  title: string;
  position: number;
  /** Максимум задач в колонке (WIP-лимит); null - без ограничения */
  wipLimit: number | null;
  tasks: Task[];
}

export interface BoardDetails {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  role: Role;
  members: Member[];
  columns: Column[];
}

export interface TaskFields {
  title?: string;
  description?: string;
  priority?: Priority;
  dueDate?: string | null;
  assigneeId?: number | null;
}
