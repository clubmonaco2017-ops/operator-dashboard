import { NavLink } from 'react-router-dom'
import {
  Bell,
  CheckSquare,
  Home,
  Network,
  UserCircle,
  Users,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission, isSuperadmin } from '../../lib/permissions.js'
import { canSeeTeamsNav } from '../../lib/teams.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'
import { UserMenuDropdown } from './UserMenuDropdown.jsx'

function RailItem({ to, end, icon, label, badge }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          end={end}
          aria-label={label}
          className={({ isActive }) =>
            `relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-[var(--fg2)] hover:bg-muted'
            }`
          }
        >
          {icon}
          {badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-[var(--danger)] text-white text-[9px] font-semibold rounded-full px-1 flex items-center justify-center tabular"
              aria-label={`${badge} непрочитанных`}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function RailNav({ className = '' }) {
  const { user, logout } = useAuth()
  const { has: hasTeamMembership } = useUserTeamMembership(user?.id)

  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeTeams = canSeeTeamsNav(user, hasTeamMembership)
  const canSeeTasks =
    hasPermission(user, 'view_own_tasks') || hasPermission(user, 'view_all_tasks')
  const canSeeNotifications = isSuperadmin(user)

  const { count: overdueCount } = useUserOverdueCount(canSeeTasks ? user?.id : null)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside
      className={`w-14 bg-card border-r border-border flex flex-col items-center py-3 gap-1 ${className}`}
      aria-label="Главное меню"
    >
      <RailItem to="/" end icon={<Home size={20} />} label="Дашборд" />
      {canSeeStaff && (
        <RailItem to="/staff" icon={<Users size={20} />} label="Сотрудники" />
      )}
      {canSeeClients && (
        <RailItem to="/clients" icon={<UserCircle size={20} />} label="Клиенты" />
      )}
      {canSeeTeams && (
        <RailItem to="/teams" icon={<Network size={20} />} label="Команды" />
      )}
      {canSeeTasks && (
        <RailItem
          to="/tasks"
          icon={<CheckSquare size={20} />}
          label="Задачи"
          badge={overdueCount}
        />
      )}

      <div className="flex-1" />

      {canSeeNotifications && (
        <RailItem
          to="/notifications"
          icon={<Bell size={20} />}
          label="Оповещения"
          badge={pending}
        />
      )}
      <UserMenuDropdown user={user} onLogout={logout} />
    </aside>
  )
}
