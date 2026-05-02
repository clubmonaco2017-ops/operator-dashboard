import { NavLink, Outlet } from 'react-router-dom'
import { Server, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

const SECTIONS = [
  { key: 'platforms', label: 'Платформы', icon: Server,    to: '/admin/platforms' },
  { key: 'agencies',  label: 'Агентства', icon: Building2, to: '/admin/agencies' },
]

function SectionLink({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={false}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-r before:bg-primary'
            : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
        )
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span>{label}</span>
    </NavLink>
  )
}

function MobileSectionTab({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={false}
      className={({ isActive }) =>
        cn(
          'relative flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors',
          isActive
            ? 'text-foreground after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-t after:bg-primary'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span>{label}</span>
    </NavLink>
  )
}

export function AdminShell() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <nav
          aria-label="Настройки"
          className="flex shrink-0 border-b border-border bg-card"
        >
          {SECTIONS.map((section) => (
            <MobileSectionTab
              key={section.key}
              to={section.to}
              label={section.label}
              icon={section.icon}
            />
          ))}
        </nav>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[220px_1fr] h-full">
      <aside
        aria-label="Настройки"
        className="border-r border-border bg-card overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-border">
          <h1 className="text-sm font-semibold text-foreground">Настройки</h1>
        </div>
        <nav className="p-2 space-y-0.5">
          {SECTIONS.map((section) => (
            <SectionLink
              key={section.key}
              to={section.to}
              label={section.label}
              icon={section.icon}
            />
          ))}
        </nav>
      </aside>
      <main className="overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
