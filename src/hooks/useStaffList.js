import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * @param {number|null} callerId
 * @param {object} [opts]
 * @param {string|null} [opts.agencyId] — per-page override; when undefined falls
 *   back to AgencyContext.activeAgencyId. Pass null explicitly to force combined view.
 */
export function useStaffList(callerId, opts = {}) {
  const { agencyId } = opts
  const { activeAgencyId } = useAgencyContext()
  const effectiveAgencyId = agencyId !== undefined ? agencyId : activeAgencyId
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_staff', { p_agency_id: effectiveAgencyId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, effectiveAgencyId, reloadKey])

  const counts = useMemo(() => {
    const c = { all: rows.length, admin: 0, moderator: 0, teamlead: 0, operator: 0, superadmin: 0 }
    for (const r of rows) c[r.role] = (c[r.role] ?? 0) + 1
    return c
  }, [rows])

  return { rows, counts, loading, error, reload: () => setReloadKey((k) => k + 1) }
}
