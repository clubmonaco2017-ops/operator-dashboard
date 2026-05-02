import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Wraps `get_agency_full(p_id)` RPC. Loads full agency record incl. counters
 * and joined platform name. Returns `{ agency, loading, error, reload }`.
 *
 * Re-loads when `agencyId` changes.
 */
export function useAgencyDetail(agencyId) {
  const [agency, setAgency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!agencyId) {
      setAgency(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_agency_full', { p_id: agencyId })
    if (err) {
      setError(err.message)
      setAgency(null)
    } else if (!data || data.length === 0) {
      setError('Агентство не найдено')
      setAgency(null)
    } else {
      const r = data[0]
      setAgency({
        id: r.out_id,
        name: r.out_name,
        platform_id: r.out_platform_id,
        platform_name: r.out_platform_name,
        logo_url: r.out_logo_url,
        contacts: Array.isArray(r.out_contacts) ? r.out_contacts : [],
        access_login: r.out_access_login,
        access_password: r.out_access_password,
        notes: r.out_notes,
        is_active: r.out_is_active,
        created_at: r.out_created_at,
        admin_count: r.out_admin_count,
        user_count: r.out_user_count,
        client_count: r.out_client_count,
        team_count: r.out_team_count,
      })
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => {
    reload()
  }, [reload])

  return { agency, loading, error, reload }
}
