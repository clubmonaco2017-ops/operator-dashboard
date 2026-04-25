import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateAllUserTeamMembership } from './useUserTeamMembership.js'

/**
 * Mutating actions для команд: create, update, archive, restore.
 * createTeam → новый id; archiveTeam → JSON с released-счётчиками.
 *
 * @param {number|null} callerId
 */
export function useTeamActions(callerId) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const createTeam = useCallback(
    async ({ name, leadUserId }) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase.rpc('create_team', {
          p_caller_id: callerId,
          p_name: name,
          p_lead_user_id: leadUserId,
        })
        if (err) throw new Error(err.message)
        return data // new team id
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [callerId],
  )

  const updateTeam = useCallback(
    async (teamId, { name, leadUserId } = {}) => {
      setLoading(true)
      setError(null)
      try {
        const { error: err } = await supabase.rpc('update_team', {
          p_caller_id: callerId,
          p_team_id: teamId,
          p_name: name ?? null,
          p_lead_user_id: leadUserId ?? null,
        })
        if (err) throw new Error(err.message)
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [callerId],
  )

  const archiveTeam = useCallback(
    async (teamId) => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: err } = await supabase.rpc('archive_team', {
          p_caller_id: callerId,
          p_team_id: teamId,
        })
        if (err) throw new Error(err.message)
        // В команде могло быть много операторов — точечный сброс не выгоден.
        invalidateAllUserTeamMembership()
        return data // jsonb { released_operators, released_clients, ... }
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [callerId],
  )

  const restoreTeam = useCallback(
    async (teamId) => {
      setLoading(true)
      setError(null)
      try {
        const { error: err } = await supabase.rpc('restore_team', {
          p_caller_id: callerId,
          p_team_id: teamId,
        })
        if (err) throw new Error(err.message)
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [callerId],
  )

  return { createTeam, updateTeam, archiveTeam, restoreTeam, loading, error }
}
