import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Деталь одной команды (через RPC get_team_detail).
 * RPC возвращает TABLE — берём первую строку.
 *
 * @param {number|null} callerId — retained as null-guard; RPC derives identity from JWT
 * @param {number|string|null} teamId
 */
export function useTeam(callerId, teamId) {
  const id = teamId == null ? null : Number(teamId)
  const idValid = Number.isFinite(id) && id > 0

  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(() => !!(callerId && idValid))
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('get_team_detail', { p_team_id: id })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else if (!data || data.length === 0) {
          setError('Команда не найдена')
          setRow(null)
        } else {
          setRow(data[0])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, id, idValid, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { row, loading, error, reload }
}
