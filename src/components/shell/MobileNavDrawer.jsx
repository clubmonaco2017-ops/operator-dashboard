import { LogOut, Moon, Sun, Monitor, Settings, Building2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '../../useAuth.jsx'
import { isSuperadmin } from '../../lib/permissions.js'
import { useTheme } from '../../hooks/useTheme.js'

const ROLE_LABEL = {
  superadmin: 'Супер-Админ',
  admin: 'Администратор',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

const THEME_OPTIONS = [
  { id: 'system', label: 'Системная', Icon: Monitor },
  { id: 'light', label: 'Светлая', Icon: Sun },
  { id: 'dark', label: 'Тёмная', Icon: Moon },
]

function computeInitials(user) {
  const source = user?.alias || user?.firstName || user?.email || '?'
  return source
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * Drawer для overflow-навигации на mobile. Открывается тапом ☰ в TopBar.
 *
 * Содержит: профиль-блок, theme switch, admin-секция (для superadmin),
 * logout. Управляется снаружи через open / onOpenChange (закрывается
 * MobileShell при route change, backdrop tap, swipe-left, Esc).
 */
export function MobileNavDrawer({ open, onOpenChange }) {
  const { user, logout } = useAuth()
  const [theme, setTheme] = useTheme()

  const displayName = user?.alias || user?.firstName || user?.email || ''
  const roleLabel = user?.role ? ROLE_LABEL[user.role] || user.role : ''
  const initials = computeInitials(user)
  const showAdmin = isSuperadmin(user)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[80%] max-w-[320px] p-0 flex flex-col"
      >
        <div
          data-slot="mobile-drawer-profile"
          style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}
          className="px-5 pb-4 border-b border-border flex items-center gap-3"
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            {roleLabel && (
              <div className="text-xs text-muted-foreground truncate">{roleLabel}</div>
            )}
          </div>
        </div>

        <div className="px-3 py-3 border-b border-border">
          <div className="px-2 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Тема
          </div>
          <div className="flex flex-col gap-1">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.Icon
              const isActive = theme === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTheme(opt.id)}
                  className={`min-h-11 flex items-center gap-3 px-3 rounded-md text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon size={16} />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {showAdmin && (
          <div className="px-3 py-3 border-b border-border">
            <div className="px-2 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Админ
            </div>
            <div className="flex flex-col gap-1">
              <NavLink
                to="/admin/platforms"
                className="min-h-11 flex items-center gap-3 px-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                <Settings size={16} />
                <span>Платформы</span>
              </NavLink>
              <NavLink
                to="/admin/agencies"
                className="min-h-11 flex items-center gap-3 px-3 rounded-md text-sm text-foreground hover:bg-muted"
              >
                <Building2 size={16} />
                <span>Агентства</span>
              </NavLink>
            </div>
          </div>
        )}

        <div
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          className="mt-auto px-3 pt-3"
        >
          <button
            type="button"
            onClick={logout}
            aria-label="Выйти"
            className="min-h-11 w-full flex items-center gap-3 px-3 rounded-md text-sm text-[var(--danger-ink)] hover:bg-[var(--danger)]/10 transition-colors"
          >
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
