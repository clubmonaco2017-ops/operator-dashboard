import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

function useLocalStorageBool(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return defaultValue
      return raw === 'true'
    } catch {
      return defaultValue
    }
  })
  const set = (v) => {
    setValue(v)
    try {
      localStorage.setItem(key, String(v))
    } catch {
      /* swallow quota/disabled */
    }
  }
  return [value, set]
}

export function Section({ id, title, icon: Icon, actions, children }) {
  const [expanded, setExpanded] = useLocalStorageBool(`dashboard.section.${id}.expanded`, true)
  return (
    <section className="border border-border rounded-lg bg-card mb-4 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 font-semibold text-sm text-foreground"
          aria-expanded={expanded}
        >
          {Icon && <Icon size={16} className="text-muted-foreground" />}
          <span>{title}</span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
          />
        </button>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {expanded && <div className="p-4 space-y-4">{children}</div>}
    </section>
  )
}

export function SubSection({ title, children }) {
  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      <div>{children}</div>
    </div>
  )
}
