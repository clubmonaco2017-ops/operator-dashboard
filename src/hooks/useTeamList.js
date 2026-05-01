import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * Список команд (через RPC list_teams).
 * Поиск — client-side: фильтруем уже загруженные строки по name/lead_name
 * (case-insensitive substring), без дополнительного RPC.
 *
 * Agency scoping: передаём p_agency_id из AgencyContext (NULL = combined view
 * по всем доступным caller'у агентствам). Optional override через opts.agencyId.
 *
 * @param {number|null} callerId — retained as null-guard; RPC derives identity from JWT
 * @param {object} [opts]
 * @param {'active'|'archived'|'all'} [opts.active]  — default 'active'
 * @param {string} [opts.search]
 * @param {string|null} [opts.agencyId] — override active agency (combined view if undefined)
 */
export function useTeamList(callerId, opts = {}) {
  const { active = 'active', search = '', agencyId } = opts
  const { activeAgencyId } = useAgencyContext()
  const effectiveAgencyId = agencyId !== undefined ? agencyId : activeAgencyId

  const [allRows, setAllRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_teams', { p_active: active, p_agency_id: effectiveAgencyId })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setAllRows([])
        } else {
          setAllRows(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, active, effectiveAgencyId, reloadKey])

  const rows = useMemo(() => {
    const q = String(search ?? '').trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((r) => {
      const name = String(r.name ?? '').toLowerCase()
      const lead = String(r.lead_name ?? '').toLowerCase()
      return name.includes(q) || lead.includes(q)
    })
  }, [allRows, search])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
