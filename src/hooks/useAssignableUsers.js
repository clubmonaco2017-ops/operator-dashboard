import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * Список пользователей, которым caller может назначать задачи
 * (через RPC list_assignable_users). Поиск — server-side, без debounce
 * (RPC отдаёт ≤50 строк, список короткий).
 *
 * @param {number|null} callerId — retained as null-guard; RPC derives identity from JWT
 * @param {string} [search]
 */
export function useAssignableUsers(callerId, search = '') {
  const { activeAgencyId } = useAgencyContext()
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
      .rpc('list_assignable_users', {
        p_search: search ?? '',
        p_agency_id: activeAgencyId,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
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
  }, [callerId, search, activeAgencyId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
