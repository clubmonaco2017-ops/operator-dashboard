import { NavLink } from 'react-router-dom'
import { hasPermission, isSuperadmin } from '../lib/permissions.js'
import { usePendingDeletionCount } from '../hooks/usePendingDeletionCount.js'

const linkBase =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-600 text-white'
const linkIdle =
  'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'

export function Sidebar({ user, onLogout }) {
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeNotifications = isSuperadmin(user)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {(user.alias || user.firstName || user.email) + ' '}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            ({user.role})
          </span>
        </div>
        <div className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
          {user.refCode}
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          Дашборд
        </NavLink>

        {canSeeStaff && (
          <NavLink
            to="/staff"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Сотрудники
          </NavLink>
        )}

        {canSeeNotifications && (
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            <span className="flex-1">Оповещения</span>
            {pending > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                {pending}
              </span>
            )}
          </NavLink>
        )}
      </nav>

      <button
        onClick={onLogout}
        className="mt-6 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Выйти
      </button>
    </aside>
  )
}
