import { Search } from 'lucide-react'

export function SearchInput({ placeholder, value, onChange, ariaLabel }) {
  return (
    <label className="relative flex items-center">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary"
      />
    </label>
  )
}
