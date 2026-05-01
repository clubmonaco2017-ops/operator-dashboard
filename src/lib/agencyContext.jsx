import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../useAuth.jsx'

const AgencyContext = createContext(null)
const STORAGE_KEY = 'activeAgencyId'

export function AgencyProvider({ children }) {
  const { user } = useAuth()
  const availableAgencies = useMemo(
    () => (Array.isArray(user?.availableAgencies) ? user.availableAgencies : []),
    [user?.availableAgencies],
  )
  const [activeAgencyId, setActiveAgencyIdState] = useState(null)

  useEffect(() => {
    if (availableAgencies.length === 0) {
      setActiveAgencyIdState(null)
      return
    }
    const stored = localStorage.getItem(STORAGE_KEY)
    const valid = stored && availableAgencies.some((a) => a.id === stored)
    const next = valid ? stored : availableAgencies[0].id
    setActiveAgencyIdState(next)
    if (!valid) localStorage.setItem(STORAGE_KEY, next)
  }, [availableAgencies])

  const setActiveAgency = (id) => {
    // null = «Все агентства» (combined view) — допустимое значение для superadmin
    if (id !== null && !availableAgencies.some((a) => a.id === id)) return
    setActiveAgencyIdState(id)
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, id)
  }

  const value = useMemo(
    () => ({
      availableAgencies,
      activeAgencyId,
      setActiveAgency,
      isMultiAgency: availableAgencies.length > 1,
      activeAgency: availableAgencies.find((a) => a.id === activeAgencyId) ?? null,
    }),
    [availableAgencies, activeAgencyId],
  )

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>
}

export function useAgencyContext() {
  const ctx = useContext(AgencyContext)
  if (!ctx) throw new Error('useAgencyContext must be used inside AgencyProvider')
  return ctx
}
