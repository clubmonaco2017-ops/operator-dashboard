import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Клиенты без команды (через RPC list_unassigned_clients).
 * Поиск — серверный аргумент RPC.
 *
 * @param {number|null} callerId
 * @param {string} [search]
 * @param {string|null} [agencyId] — uuid агентства; null = combined view across accessible agencies
 */
export function useUnassignedClients(callerId, search = '', agencyId = null) {
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
      .rpc('list_unassigned_clients', {
        p_agency_id: agencyId,
        p_search: search || null,
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
  }, [callerId, search, agencyId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
