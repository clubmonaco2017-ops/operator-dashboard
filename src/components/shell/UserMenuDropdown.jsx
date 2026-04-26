import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
          {user?.role && (
            <div className="text-xs text-muted-foreground">{user.role}</div>
          )}
          {user?.refCode && (
            <div className="font-mono text-xs text-[var(--fg4)] mt-0.5">
              {user.refCode}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
