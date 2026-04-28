import { ArrowLeft, Bell, Menu } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../useAuth.jsx'
import { isSuperadmin } from '../../lib/permissions.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'
import { useSectionTitleValue } from '../../hooks/useSectionTitle.jsx'

const ROUTE_TO_TITLE = {
  '/': 'Дашборд',
  '/staff': 'Сотрудники',
  '/clients': 'Клиенты',
  '/teams': 'Команды',
  '/tasks': 'Задачи',
  '/notifications': 'Оповещения',
}

function deriveFallbackTitle(pathname) {
  if (ROUTE_TO_TITLE[pathname]) return ROUTE_TO_TITLE[pathname]
  // /tasks/all, /tasks/outbox, etc.
  for (const [prefix, label] of Object.entries(ROUTE_TO_TITLE)) {
    if (prefix !== '/' && pathname.startsWith(prefix)) return label
  }
  return ''
}

/**
 * Fixed 48px header for mobile shell.
 *
 * Left side:
 *   - default: hamburger (☰) — calls onMenuClick to open the drawer.
 *   - when context has backTo: ← back-arrow that navigates to that path.
 * Right side:
 *   - 🔔 (only for superadmin) with optional pending-count badge.
 *     Tap navigates to /notifications.
 *
 * Title from useSectionTitleValue(); falls back to a route-derived label.
 */
export function MobileTopBar({ onMenuClick }) {
  const { title: ctxTitle, backTo } = useSectionTitleValue()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const pending = usePendingDeletionCount({ enabled: isSuperadmin(user) })

  const title = ctxTitle || deriveFallbackTitle(location.pathname)
  const showNotifications = isSuperadmin(user)

  return (
    <header
      data-slot="mobile-top-bar"
      className="h-12 bg-card border-b border-border flex items-center justify-between px-2 pt-[env(safe-area-inset-top)]"
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {backTo ? (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="Назад"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Открыть меню"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
          >
            <Menu size={22} />
          </button>
        )}
        <span className="text-base font-semibold text-foreground truncate">
          {title}
        </span>
      </div>
      {showNotifications && (
        <NavLink
          to="/notifications"
          aria-label="Оповещения"
          className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-foreground hover:bg-muted transition-colors"
        >
          <Bell size={22} />
          {pending > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-[var(--danger)] text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-card flex items-center justify-center tabular"
              aria-label={`${pending} непрочитанных`}
            >
              {pending > 99 ? '99+' : pending}
            </span>
          )}
        </NavLink>
      )}
    </header>
  )
}
