import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает членство оператора в команде (или null).
 * Используется в ProfileTab (внутри StaffDetailPanel) для блока «Команда».
 *
 * @param {number|null} callerId
 * @param {number|null} operatorUserId
 * @returns {{
 *   data: {team_id, team_name, lead_user_id, lead_name, lead_role}|null,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useStaffTeamMembership(callerId, operatorUserId) {
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
      .rpc('get_staff_team_membership', {
        p_staff_id: operatorUserId,
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
        setData({
          team_id: row.team_id,
          team_name: row.team_name,
          lead_user_id: row.lead_user_id,
          lead_name: row.lead_name || 'Лид',
          lead_role: row.lead_role ?? null,
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
