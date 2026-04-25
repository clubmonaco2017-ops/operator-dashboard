import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает членство оператора в команде (или null).
 * Используется в StaffDetailPage для блока «Команда».
 *
 * @param {number|null} operatorUserId
 * @returns {{
 *   data: {team_id, team_name, lead_user_id, lead_name, lead_role}|null,
 *   loading: boolean,
 *   error: string|null,
 *   reload: () => void,
 * }}
 */
export function useStaffTeamMembership(operatorUserId) {
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
      .from('team_members')
      .select('team_id, teams!inner(id, name, lead_user_id)')
      .eq('operator_id', operatorUserId)
      .maybeSingle()
      .then(async ({ data: row, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setData(null)
          return
        }
        if (!row) {
          setData(null)
          return
        }
        const lead = await supabase
          .from('dashboard_users')
          .select('id, first_name, last_name, alias, email, role')
          .eq('id', row.teams.lead_user_id)
          .maybeSingle()
        if (cancelled) return
        const leadRow = lead?.data
        let leadName = 'Лид'
        if (leadRow) {
          const full = `${leadRow.first_name ?? ''} ${leadRow.last_name ?? ''}`.trim()
          leadName = full || leadRow.alias || leadRow.email || 'Лид'
        }
        setData({
          team_id: row.team_id,
          team_name: row.teams.name,
          lead_user_id: row.teams.lead_user_id,
          lead_name: leadName,
          lead_role: leadRow?.role ?? null,
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
