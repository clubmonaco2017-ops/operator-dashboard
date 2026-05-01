import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useAgencyContext } from '../lib/agencyContext.jsx'

export default function AgencySwitcher() {
  const {
    availableAgencies,
    activeAgencyId,
    activeAgency,
    setActiveAgency,
    isMultiAgency,
  } = useAgencyContext()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!isMultiAgency) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        {activeAgency?.name ?? 'Выбрать агентство'}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[200px] rounded-md border border-border bg-popover shadow-md py-1 z-50"
        >
          {availableAgencies.map((agency) => (
            <button
              key={agency.id}
              role="menuitem"
              type="button"
              onClick={() => {
                setActiveAgency(agency.id)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
            >
              <span>{agency.name}</span>
              {agency.id === activeAgencyId && <Check className="h-4 w-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
