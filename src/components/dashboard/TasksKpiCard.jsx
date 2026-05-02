import { Link } from 'react-router-dom'

const ACCENT_BORDER = {
  red: 'border-l-[3px] border-l-red-500',
  blue: 'border-l-[3px] border-l-blue-500',
  none: '',
}

/**
 * Dashboard card for Tasks: dual-stat (unread + overdue) with per-number
 * color signals. Click → navigates to `to`.
 *
 * @param {object} props
 * @param {string} props.label — header label (e.g. "Мои задачи")
 * @param {number} props.unread — unread tasks count for this scope
 * @param {number} props.overdue — overdue tasks count for this scope
 * @param {React.ComponentType} props.icon — lucide icon component
 * @param {string} props.to — link target
 * @param {boolean} [props.loading]
 */
export function TasksKpiCard({
  label,
  unread,
  overdue,
  icon: Icon,
  to,
  loading = false,
}) {
  const accentColor = overdue > 0 ? 'red' : unread > 0 ? 'blue' : 'none'
  const accentClass = ACCENT_BORDER[accentColor]

  const unreadClass =
    unread > 0 ? 'text-blue-600' : 'text-muted-foreground'
  const overdueClass =
    overdue > 0 ? 'text-red-600' : 'text-muted-foreground'

  const renderValue = (n) => (loading ? '…' : n)

  return (
    <Link to={to} className="block">
      <article
        className={`bg-card border border-border rounded-lg p-4 ${accentClass}`}
      >
        <header className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            {label}
          </span>
          {Icon && <Icon size={16} className="text-muted-foreground" />}
        </header>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <div className={`text-lg md:text-xl font-bold ${unreadClass}`}>
              {renderValue(unread)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              непрочитанных
            </div>
          </div>
          <div>
            <div className={`text-lg md:text-xl font-bold ${overdueClass}`}>
              {renderValue(overdue)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              просрочено
            </div>
          </div>
        </div>
      </article>
    </Link>
  )
}
