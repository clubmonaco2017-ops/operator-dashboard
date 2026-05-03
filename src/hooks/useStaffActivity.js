import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Лента событий по конкретному сотруднику (таблица staff_activity).
 * Permission gate в RPC: superadmin/admin или caller == p_user_id.
 *
 * @param {number|null} userId
 * @param {{ limit?: number }} [opts]
 */
export function useStaffActivity(userId, opts = {}) {
  const { limit = 50 } = opts
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) { setRows([]); return }
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_staff_activity', { p_user_id: userId, p_limit: limit })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setRows([]) }
        else setRows(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [userId, limit])

  return { rows, loading, error }
}
