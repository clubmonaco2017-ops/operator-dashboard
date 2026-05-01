import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Wraps `list_all_agencies` RPC. Returns flattened rows + loading/error/reload.
 * Superadmin-only RPC (выкинет ошибку для прочих).
 */
export function useAgencyList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('list_all_agencies')
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(
        (data ?? []).map((r) => ({
          id: r.out_id,
          name: r.out_name,
          platform_id: r.out_platform_id,
          platform_name: r.out_platform_name,
          is_active: r.out_is_active,
          admin_count: r.out_admin_count,
          user_count: r.out_user_count,
          client_count: r.out_client_count,
          team_count: r.out_team_count,
          created_at: r.out_created_at,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload }
}
