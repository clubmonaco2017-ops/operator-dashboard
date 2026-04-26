import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUserTeamMembership } from './useUserTeamMembership.js'

/**
 * Кураторство: список операторов под куратором + actions
 * setCurator (один) и bulkAssign (много на текущего модератора).
 *
 * @param {number|null} callerId
 * @param {number|null} moderatorId
 */
export function useCuratorship(callerId, moderatorId) {
  const [operators, setOperators] = useState([])
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !moderatorId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_curated_operators', {
        p_caller_id: callerId,
        p_moderator_id: moderatorId,
      })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setOperators([])
        } else {
          setOperators(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, moderatorId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const setCurator = useCallback(
    async (operatorId, newModeratorId) => {
      setError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('set_operator_curator', {
          p_caller_id: callerId,
          p_operator_id: operatorId,
          p_new_moderator_id: newModeratorId,
        })
        if (err) throw new Error(err.message)
        // Кураторство и членство в команде — разные сущности, но curator-смена
        // часто идёт парой с move_team_member; держим кэш консистентным.
        invalidateUserTeamMembership(operatorId)
        reload()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setMutating(false)
      }
    },
    [callerId, reload],
  )

  const bulkAssign = useCallback(
    async (operatorIds) => {
      setError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('bulk_assign_curated_operators', {
          p_caller_id: callerId,
          p_moderator_id: moderatorId,
          p_operator_ids: operatorIds,
        })
        if (err) throw new Error(err.message)
        if (Array.isArray(operatorIds)) {
          for (const opId of operatorIds) invalidateUserTeamMembership(opId)
        }
        reload()
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setMutating(false)
      }
    },
    [callerId, moderatorId, reload],
  )

  return { operators, setCurator, bulkAssign, mutating, loading, error, reload }
}
