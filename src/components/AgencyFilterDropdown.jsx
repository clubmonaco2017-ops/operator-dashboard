import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * Per-page agency filter override. Hidden for single-agency users.
 * value === null  → "Все агентства" (combined view across user's accessible agencies).
 * value === uuid  → narrow to that agency.
 */
export default function AgencyFilterDropdown({ value, onChange, label }) {
  const { isMultiAgency, availableAgencies } = useAgencyContext()
  if (!isMultiAgency) return null

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
      <select
        aria-label={label || 'Фильтр по агентству'}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="">Все агентства</option>
        {availableAgencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}
