import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useDeletionRequests(callerId, status = 'pending') {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('list_deletion_requests', { p_caller_id: callerId, p_status: status })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setRows([]) }
        else setRows(data ?? [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [callerId, status, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { rows, loading, error, reload }
}
