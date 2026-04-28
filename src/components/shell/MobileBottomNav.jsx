import { NavLink } from 'react-router-dom'
import { CheckSquare, LayoutDashboard, Network, UserCircle, Users } from 'lucide-react'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'
import { canSeeTeamsNav } from '../../lib/teams.js'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

function NavItem({ to, end, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative min-h-11 min-w-11 flex flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
          isActive ? 'text-primary' : 'text-[var(--fg2)]'
        }`
      }
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span
            className="absolute -top-1 -right-2 min-w-[18px] h-[18px] bg-[var(--danger)] text-white text-[10px] font-bold rounded-full px-1 ring-2 ring-card flex items-center justify-center tabular"
            aria-label={`${badge} срочных`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </NavLink>
  )
}

/**
 * Fixed 56px bottom nav for mobile shell.
 *
 * Up to 5 NavLink items, role-gated identically to RailNav:
 *   - Дашборд (always)
 *   - Сотр. (create_users)
 *   - Клиенты (manage_clients)
 *   - Команды (canSeeTeamsNav)
 *   - Задачи (view_own_tasks | view_all_tasks) with overdue badge
 *
 * Does NOT render notifications (TopBar), theme toggle (drawer),
 * or user menu (drawer).
 */
export function MobileBottomNav() {
  const { user } = useAuth()
  const { has: hasTeam } = useUserTeamMembership(user?.id)
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeClients = hasPermission(user, 'manage_clients')
  const canSeeTeams = canSeeTeamsNav(user, hasTeam)
  const canSeeTasks =
    hasPermission(user, 'view_own_tasks') || hasPermission(user, 'view_all_tasks')
  const { count: overdue } = useUserOverdueCount(canSeeTasks ? user?.id : null)

  return (
    <nav
      data-slot="mobile-bottom-nav"
      aria-label="Главное меню"
      className="h-14 bg-card border-t border-border flex items-stretch px-1 pb-[env(safe-area-inset-bottom)]"
    >
      <NavItem to="/" end icon={<LayoutDashboard size={20} />} label="Дашборд" />
      {canSeeStaff && (
        <NavItem to="/staff" icon={<Users size={20} />} label="Сотрудники" />
      )}
      {canSeeClients && (
        <NavItem to="/clients" icon={<UserCircle size={20} />} label="Клиенты" />
      )}
      {canSeeTeams && (
        <NavItem to="/teams" icon={<Network size={20} />} label="Команды" />
      )}
      {canSeeTasks && (
        <NavItem
          to="/tasks"
          icon={<CheckSquare size={20} />}
          label="Задачи"
          badge={overdue}
        />
      )}
    </nav>
  )
}
