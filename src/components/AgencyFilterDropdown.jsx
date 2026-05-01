import { Briefcase, X } from 'lucide-react'
import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * Per-page agency filter styled as a Chip (matches ClientFilterChips visual).
 * value === null  → «Агентство все» (combined view across user's accessible agencies).
 * value === uuid  → narrow to that agency.
 * Hidden for single-agency users.
 */
export default function AgencyFilterDropdown({ value, onChange }) {
  const { isMultiAgency, availableAgencies } = useAgencyContext()
  if (!isMultiAgency) return null

  const active = value !== null

  return (
    <div
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
        active
          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-ink)]'
          : 'border-border text-[var(--fg2)] hover:border-border-strong',
      ].join(' ')}
    >
      <Briefcase size={12} />
      <select
        aria-label="Фильтр по агентству"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="cursor-pointer bg-transparent text-xs outline-none"
      >
        <option value="">Агентство все</option>
        {availableAgencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-0.5 rounded-full p-0.5 text-[var(--primary-ink)]/70 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-ink)]"
          aria-label="Снять фильтр по агентству"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}
