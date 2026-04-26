import { Check, Monitor, Sun, Moon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '../../hooks/useTheme.js'

const THEME_OPTIONS = [
  { id: 'system', label: 'Системная', icon: Monitor },
  { id: 'light', label: 'Светлая', icon: Sun },
  { id: 'dark', label: 'Тёмная', icon: Moon },
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

export function UserMenuDropdown({ user, onLogout }) {
  const initials = computeInitials(user)
  const displayName = user?.alias || user?.firstName || user?.email || ''
  const [theme, setTheme] = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full" aria-label="Меню пользователя">
          <Avatar className="h-9 w-9">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5">
          <div className="text-sm font-semibold">{displayName}</div>
          {user?.role && <div className="text-xs text-muted-foreground">{user.role}</div>}
          {user?.refCode && (
            <div className="font-mono text-xs text-[var(--fg4)] mt-0.5">{user.refCode}</div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Тема</DropdownMenuLabel>
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isActive = theme === opt.id
            return (
              <DropdownMenuItem
                key={opt.id}
                closeOnClick={false}
                onClick={() => setTheme(opt.id)}
                className="gap-2"
              >
                <Icon size={14} className="text-muted-foreground" />
                <span>{opt.label}</span>
                {isActive && <Check size={14} className="ml-auto text-primary" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
