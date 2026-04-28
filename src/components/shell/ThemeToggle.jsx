import { Check, Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '../../hooks/useTheme.js'

const THEME_OPTIONS = [
  { id: 'system', label: 'Системная', icon: Monitor },
  { id: 'light', label: 'Светлая', icon: Sun },
  { id: 'dark', label: 'Тёмная', icon: Moon },
]

function ContrastIcon({ size = 20 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 3l0 18" />
      <path d="M12 9l4.65 -4.65" />
      <path d="M12 14.3l7.37 -7.37" />
      <path d="M12 19.6l8.85 -8.85" />
    </svg>
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme()

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--fg2)] hover:bg-muted transition-colors"
                  aria-label="Тема оформления"
                >
                  <ContrastIcon size={20} />
                </button>
              }
            />
          }
        />
        <TooltipContent side="right">Тема</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="end" className="min-w-[180px]">
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
