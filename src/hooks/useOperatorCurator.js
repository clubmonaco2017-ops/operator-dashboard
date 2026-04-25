import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает текущего куратора оператора (или null).
 * Используется в StaffDetailPage для блока «Куратор».
 *
 * @param {number|null} operatorUserId
 * @returns {{
 *   data: {moderator_id, first_name, last_name, alias, email, ref_code, role}|null,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useOperatorCurator(operatorUserId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!operatorUserId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('moderator_operators')
      .select(
        'moderator_id, moderator:dashboard_users!moderator_operators_moderator_id_fkey(id, first_name, last_name, alias, email, ref_code, role)',
      )
      .eq('operator_id', operatorUserId)
      .maybeSingle()
      .then(({ data: row, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setData(null)
          return
        }
        if (!row || !row.moderator) {
          setData(null)
          return
        }
        const m = row.moderator
        setData({
          moderator_id: row.moderator_id,
          first_name: m.first_name,
          last_name: m.last_name,
          alias: m.alias,
          email: m.email,
          ref_code: m.ref_code,
          role: m.role,
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [operatorUserId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { data, loading, error, reload }
}
