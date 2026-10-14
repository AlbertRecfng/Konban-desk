import { Link, Outlet } from 'react-router';
import { useRealtimeStatus } from '../api/realtime';
import { useAuth } from '../auth/AuthContext';
import { Button } from './ui';

export function Layout() {
  const { user, logout } = useAuth();
  const online = useRealtimeStatus();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-semibold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-sm text-white">K</span>
          Kanban
        </Link>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs text-slate-500"
            title={online ? 'Изменения других участников появляются сразу' : 'Нет связи с сервером: изменения других участников не видны'}
          >
            <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {online ? 'Онлайн' : 'Нет связи'}
          </span>
          <span className="hidden text-sm text-slate-600 sm:inline">{user?.name}</span>
          <Button variant="secondary" onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
