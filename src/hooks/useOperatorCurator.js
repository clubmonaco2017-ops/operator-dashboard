import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает текущего куратора оператора (или null).
 * Используется в ProfileTab (внутри StaffDetailPanel) для блока «Куратор».
 *
 * @param {number|null} callerId
 * @param {number|null} operatorUserId
 * @returns {{
 *   data: {moderator_id, first_name, last_name, alias, email, ref_code, role}|null,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useOperatorCurator(callerId, operatorUserId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!operatorUserId || !callerId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('get_operator_curator', {
        p_caller_id: callerId,
        p_operator_id: operatorUserId,
      })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setData(null)
          return
        }
        const row = (rows ?? [])[0]
        if (!row) {
          setData(null)
          return
        }
        // The RPC returns a flattened, name-prefixed shape. Rebuild the
        // first/last/email pieces from the joined fields where available.
        // Since the RPC only exposes a composed name, alias, ref_code and
        // role, we surface name as first_name+last_name='' fallback.
        setData({
          moderator_id: row.moderator_id,
          first_name: null,
          last_name: null,
          alias: row.moderator_alias ?? null,
          email: null,
          ref_code: row.moderator_ref_code ?? null,
          role: row.moderator_role ?? null,
          // Composed display name from the RPC (always non-null since COALESCE).
          display_name: row.moderator_name ?? null,
        })
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [callerId, operatorUserId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, reload }
}
