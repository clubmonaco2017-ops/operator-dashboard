import { useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Mutating actions для клиента: create, update, archive, restore.
 * Возвращает функции; не хранит локальное состояние — использовать вместе
 * с useClientList / useClient для перезагрузки списков.
 */
export function useClientActions(callerId) {
  const createClient = useCallback(
    async ({
      name,
      alias = null,
      description = null,
      avatarUrl = null,
      platformId,
      agencyId,
      tableauId = null,
    }) => {
      const { data, error } = await supabase.rpc('create_client', {
        p_caller_id: callerId,
        p_name: name,
        p_alias: alias,
        p_description: description,
        p_avatar_url: avatarUrl,
        p_platform_id: platformId,
        p_agency_id: agencyId,
        p_tableau_id: tableauId,
      })
      if (error) throw new Error(error.message)
      return data // new client id
    },
    [callerId],
  )

  const updateClient = useCallback(
    async (
      clientId,
      {
        name,
        alias,
        description,
        avatarUrl,
        platformId,
        agencyId,
        tableauId,
        clearAlias = false,
        clearDescription = false,
        clearAvatarUrl = false,
        clearTableauId = false,
      } = {},
    ) => {
      const { error } = await supabase.rpc('update_client', {
        p_caller_id: callerId,
        p_client_id: clientId,
        p_name: name ?? null,
        p_alias: alias ?? null,
        p_description: description ?? null,
        p_avatar_url: avatarUrl ?? null,
        p_platform_id: platformId ?? null,
        p_agency_id: agencyId ?? null,
        p_tableau_id: tableauId ?? null,
        p_clear_alias: clearAlias,
        p_clear_description: clearDescription,
        p_clear_avatar_url: clearAvatarUrl,
        p_clear_tableau_id: clearTableauId,
      })
      if (error) throw new Error(error.message)
    },
    [callerId],
  )

  const archiveClient = useCallback(
    async (clientId) => {
      const { error } = await supabase.rpc('archive_client', {
        p_caller_id: callerId,
        p_client_id: clientId,
      })
      if (error) throw new Error(error.message)
    },
    [callerId],
  )

  const restoreClient = useCallback(
    async (clientId) => {
      const { error } = await supabase.rpc('restore_client', {
        p_caller_id: callerId,
        p_client_id: clientId,
      })
      if (error) throw new Error(error.message)
    },
    [callerId],
  )

  return { createClient, updateClient, archiveClient, restoreClient }
}
