import { useEffect } from 'react'
import { useAgencyContext } from '../lib/agencyContext.jsx'

export default function AgencySelect({
  value,
  onChange,
  disabled,
  required = true,
  label = 'Агентство',
}) {
  const { availableAgencies, isMultiAgency } = useAgencyContext()

  useEffect(() => {
    if (
      !isMultiAgency &&
      availableAgencies.length === 1 &&
      value !== availableAgencies[0].id
    ) {
      onChange(availableAgencies[0].id)
    }
  }, [availableAgencies, isMultiAgency, value, onChange])

  if (!isMultiAgency) return null

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      >
        <option value="" disabled={required}>
          Выберите агентство
        </option>
        {availableAgencies.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  )
}
