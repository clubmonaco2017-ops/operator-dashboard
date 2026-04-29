import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список клиентов команды + actions assign/unassign/move.
 *
 * Selector + actions: получает уже загруженный `row` от родительского useTeam
 * и его `reload`, чтобы избежать второго вызова get_team_detail на странице.
 *
 * @param {number|null} callerId — retained as null-guard; RPCs derive identity from JWT
 * @param {object|null} row — результат useTeam(callerId, teamId).row
 * @param {Function|null} reload — useTeam(...).reload
 */
export function useTeamClients(callerId, row, reload) {
  const [actionError, setActionError] = useState(null)
  const [mutating, setMutating] = useState(false)

  const clients = Array.isArray(row?.clients) ? row.clients : []

  const assignClients = useCallback(
    async (clientIds) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('assign_team_clients', {
          p_team_id: row?.id,
          p_client_ids: clientIds,
        })
        if (err) throw new Error(err.message)
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

  const unassignClient = useCallback(
    async (clientId) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('unassign_team_client', {
          p_team_id: row?.id,
          p_client_id: clientId,
        })
        if (err) throw new Error(err.message)
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

  const moveClient = useCallback(
    async (toTeamId, clientId) => {
      setActionError(null)
      setMutating(true)
      try {
        const { error: err } = await supabase.rpc('move_team_client', {
          p_from_team: row?.id,
          p_to_team: toTeamId,
          p_client_id: clientId,
        })
        if (err) throw new Error(err.message)
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
    clients,
    assignClients,
    unassignClient,
    moveClient,
    mutating,
    error: actionError,
  }
}
