import { request } from './client';
import type { AuthResponse, BoardDetails, BoardSummary, Column, Member, Task, TaskFields, User } from './types';

type MemberRole = 'editor' | 'viewer';

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retryOnUnauthorized: false,
    }),
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password },
      retryOnUnauthorized: false,
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST', retryOnUnauthorized: false }),
  me: () => request<{ user: User }>('/auth/me'),
};

export const boardsApi = {
  list: () => request<BoardSummary[]>('/boards'),
  get: (boardId: number) => request<BoardDetails>(`/boards/${boardId}`),
  create: (title: string, description: string) =>
    request<BoardSummary>('/boards', { method: 'POST', body: { title, description } }),
  update: (boardId: number, data: { title?: string; description?: string }) =>
    request<BoardSummary>(`/boards/${boardId}`, { method: 'PATCH', body: data }),
  remove: (boardId: number) => request<void>(`/boards/${boardId}`, { method: 'DELETE' }),
  addColumn: (boardId: number, title: string) =>
    request<Column>(`/boards/${boardId}/columns`, { method: 'POST', body: { title } }),
};

export const columnsApi = {
  update: (columnId: number, data: { title?: string; wipLimit?: number | null }) =>
    request<Column>(`/columns/${columnId}`, { method: 'PATCH', body: data }),
  move: (columnId: number, position: number) =>
    request<Column>(`/columns/${columnId}/move`, { method: 'PATCH', body: { position } }),
  remove: (columnId: number) => request<void>(`/columns/${columnId}`, { method: 'DELETE' }),
  addTask: (columnId: number, data: TaskFields & { title: string }) =>
    request<Task>(`/columns/${columnId}/tasks`, { method: 'POST', body: data }),
};

export const tasksApi = {
  update: (taskId: number, data: TaskFields) => request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: data }),
  move: (taskId: number, columnId: number, position: number) =>
    request<Task>(`/tasks/${taskId}/move`, { method: 'PATCH', body: { columnId, position } }),
  remove: (taskId: number) => request<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
};

export const membersApi = {
  list: (boardId: number) => request<Member[]>(`/boards/${boardId}/members`),
  add: (boardId: number, email: string, role: MemberRole) =>
    request<Member>(`/boards/${boardId}/members`, { method: 'POST', body: { email, role } }),
  changeRole: (boardId: number, userId: number, role: MemberRole) =>
    request<Member>(`/boards/${boardId}/members/${userId}`, { method: 'PATCH', body: { role } }),
  remove: (boardId: number, userId: number) =>
    request<void>(`/boards/${boardId}/members/${userId}`, { method: 'DELETE' }),
};
