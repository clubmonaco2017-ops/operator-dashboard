const ACCENT_BORDER = {
  blue: 'border-l-[3px] border-l-blue-500',
  green: 'border-l-[3px] border-l-green-500',
  purple: 'border-l-[3px] border-l-purple-500',
  orange: 'border-l-[3px] border-l-orange-500',
  red: 'border-l-[3px] border-l-red-500',
}

const DELTA_CLASS = {
  up: 'text-green-600',
  down: 'text-red-600',
  neutral: 'text-muted-foreground',
}

const DELTA_ARROW = {
  up: '↗',
  down: '↘',
  neutral: '→',
}

// Note: callers may pass a `sparkline` prop, but Stage 6A3 ships without
// a Sparkline component, so it's silently ignored (not destructured). Re-add
// the destructure + render when the component lands.
export function KpiCard({
  label,
  value,
  icon: Icon,
  sublabel,
  delta,
  accentColor,
  children,
}) {
  const accentClass = accentColor ? ACCENT_BORDER[accentColor] || '' : ''
  return (
    <article className={`bg-card border border-border rounded-lg p-4 ${accentClass}`}>
      <header className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        {Icon && <Icon size={16} className="text-muted-foreground" />}
      </header>
      <div className="text-lg md:text-xl font-bold mt-1 flex items-baseline gap-2 text-foreground min-w-0">
        <span className="truncate min-w-0" title={typeof value === 'string' ? value : undefined}>{value}</span>
        {delta && (
          <span className={`text-xs font-medium ${DELTA_CLASS[delta.direction]}`}>
            {DELTA_ARROW[delta.direction]} {Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
      {children}
    </article>
  )
}
