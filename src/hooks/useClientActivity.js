import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * События клиента (правая колонка «Активность»).
 *
 * @param {number|null} callerId
 * @param {number|null} clientId
 * @param {number} [limit] — default 12
 */
export function useClientActivity(callerId, clientId, limit = 12) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const id = clientId == null ? null : Number(clientId)
  const idValid = Number.isFinite(id) && id > 0

  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_client_activity', {
        p_client_id: id,
        p_limit: limit,
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
  }, [callerId, id, idValid, limit, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
