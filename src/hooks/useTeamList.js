import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список команд (через RPC list_teams).
 * Поиск — client-side: фильтруем уже загруженные строки по name/lead_name
 * (case-insensitive substring), без дополнительного RPC.
 *
 * @param {number|null} callerId
 * @param {object} [opts]
 * @param {'active'|'archived'|'all'} [opts.active]  — default 'active'
 * @param {string} [opts.search]
 */
export function useTeamList(callerId, opts = {}) {
  const { active = 'active', search = '' } = opts

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
      .rpc('list_teams', { p_caller_id: callerId, p_active: active })
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
  }, [callerId, active, reloadKey])

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
