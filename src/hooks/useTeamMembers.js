import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUserTeamMembership } from './useUserTeamMembership.js'

/**
 * Состав команды + actions add/remove/move.
 *
 * Selector + actions: получает уже загруженный `row` от родительского useTeam
 * и его `reload`, чтобы избежать второго вызова get_team_detail на странице.
 *
 * @param {number|null} callerId — retained as null-guard; RPCs derive identity from JWT
 * @param {object|null} row — результат useTeam(callerId, teamId).row
 * @param {Function|null} reload — useTeam(...).reload
 */
export function useTeamMembers(callerId, row, reload) {
  const [actionError, setActionError] = useState(null)
  const [mutating, setMutating] = useState(false)

  const members = Array.isArray(row?.members) ? row.members : []

  const addMember = useCallback(
    async (operatorId) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('add_team_member', {
          p_team_id: row?.id,
          p_operator_id: operatorId,
        })
        if (err) throw new Error(err.message)
        invalidateUserTeamMembership(operatorId)
        reload?.()
      } catch (e) {
        setActionError(e.message)
        throw e
      } finally {
        setMutating(false)
      }
    },
    [callerId, row?.id, reload],
  )

  const removeMember = useCallback(
    async (operatorId) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('remove_team_member', {
          p_team_id: row?.id,
          p_operator_id: operatorId,
        })
        if (err) throw new Error(err.message)
        invalidateUserTeamMembership(operatorId)
        reload?.()
      } catch (e) {
        setActionError(e.message)
        throw e
      } finally {
        setMutating(false)
      }
    },
    [callerId, row?.id, reload],
  )

  const moveMember = useCallback(
    async (toTeamId, operatorId) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('move_team_member', {
          p_from_team: row?.id,
          p_to_team: toTeamId,
          p_operator_id: operatorId,
        })
        if (err) throw new Error(err.message)
        // Operator всё ещё в какой-то команде, но кэш по operatorId устарел.
        invalidateUserTeamMembership(operatorId)
        reload?.()
      } catch (e) {
        setActionError(e.message)
        throw e
      } finally {
        setMutating(false)
      }
    },
    [callerId, row?.id, reload],
  )

  return {
    members,
    addMember,
    removeMember,
    moveMember,
    mutating,
    error: actionError,
  }
}
