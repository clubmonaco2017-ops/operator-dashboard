import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAgencyContext } from '../lib/agencyContext.jsx'

/**
 * Операторы без команды (через RPC list_unassigned_operators).
 * Поиск — серверный аргумент RPC.
 *
 * @param {string} [search]
 */
export function useUnassignedOperators(search = '') {
  const { activeAgencyId } = useAgencyContext()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_unassigned_operators', {
        p_search: search || null,
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
  }, [search, activeAgencyId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
