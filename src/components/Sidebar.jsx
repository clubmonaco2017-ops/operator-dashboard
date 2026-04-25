import { NavLink } from 'react-router-dom'
import { hasPermission, isSuperadmin } from '../lib/permissions.js'
import { usePendingDeletionCount } from '../hooks/usePendingDeletionCount.js'

const linkBase =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus-ds'
const linkActive = 'bg-primary text-primary-foreground'
const linkIdle = 'text-[var(--fg2)] hover:bg-muted'

export function Sidebar({ user, onLogout }) {
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeNotifications = isSuperadmin(user)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside
      className="hidden w-60 shrink-0 border-r border-border bg-card p-4 lg:block"
      aria-label="Главное меню"
    >
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold text-foreground">
          {(user.alias || user.firstName || user.email) + ' '}
          <span className="text-xs font-normal text-muted-foreground">
            ({user.role})
          </span>
        </div>
        <div className="mt-1 font-mono text-xs text-[var(--fg4)]">
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

        {canSeeClients && (
          <NavLink
            to="/clients"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Клиенты
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
              <span className="rounded-full bg-[var(--danger)] px-2 py-0.5 text-xs font-semibold text-white tabular">
                {pending}
              </span>
            )}
          </NavLink>
        )}
      </nav>

      <button
        onClick={onLogout}
        className="btn-ghost mt-6 w-full justify-center"
      >
        Выйти
      </button>
    </aside>
  )
}
