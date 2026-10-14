import type { AuthResponse } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Access-токен хранится только в памяти: так его не украдёт XSS через localStorage.
// После перезагрузки страницы он восстанавливается по refresh-cookie.
let accessToken: string | null = null;
let sessionExpiredListener: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// id подключения Socket.IO: сервер не присылает автору изменения уведомление о нём же
let socketIdProvider: () => string | undefined = () => undefined;

export function setSocketIdProvider(provider: () => string | undefined) {
  socketIdProvider = provider;
}

// Учёт изменяющих запросов (всё, кроме GET). Нужен, чтобы перезагрузка доски по событию
// от другого пользователя не затёрла собственное изменение, ответ на которое ещё не пришёл.
let mutationsStarted = 0;
let mutationsInFlight = 0;
const idleListeners = new Set<() => void>();

export function mutationState() {
  return { started: mutationsStarted, inFlight: mutationsInFlight };
}

/** Вызывается, когда завершились все изменяющие запросы */
export function onMutationsIdle(listener: () => void): () => void {
  idleListeners.add(listener);
  return () => idleListeners.delete(listener);
}

/** Вызывается, когда refresh-токен истёк и пользователя нужно отправить на вход. */
export function onSessionExpired(listener: (() => void) | null) {
  sessionExpiredListener = listener;
}

let refreshing: Promise<AuthResponse | null> | null = null;

/**
 * Обновляет access-токен по refresh-cookie. Параллельные вызовы получают один
 * и тот же запрос: сервер меняет refresh-токен при каждом обновлении, и второй
 * одновременный запрос со старым токеном завершил бы сессию.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as AuthResponse;
    })
    .catch(() => null)
    .then((session) => {
      accessToken = session?.accessToken ?? null;
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: string };
    return new ApiError(res.status, data.error ?? `Ошибка сервера (${res.status})`);
  } catch {
    return new ApiError(res.status, `Ошибка сервера (${res.status})`);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false для запросов авторизации: их 401 означает «неверный пароль», а не истёкший токен */
  retryOnUnauthorized?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isMutation = (options.method ?? 'GET') !== 'GET';
  if (!isMutation) return send<T>(path, options);

  mutationsStarted++;
  mutationsInFlight++;
  try {
    return await send<T>(path, options);
  } finally {
    mutationsInFlight--;
    if (mutationsInFlight === 0) for (const listener of idleListeners) listener();
  }
}

async function send<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = 'GET', body, retryOnUnauthorized = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const socketId = socketIdProvider();
  if (socketId) headers['X-Socket-Id'] = socketId;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером');
  }

  if (res.status === 401 && retryOnUnauthorized) {
    const session = await refreshSession();
    if (session) return send<T>(path, { ...options, retryOnUnauthorized: false });
    sessionExpiredListener?.();
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка';
}
