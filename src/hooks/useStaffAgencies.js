import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Returns the list of agencies a staff member is bound to.
 *  - admin → all admin_agencies
 *  - operator/moderator/teamlead → single agency
 *  - superadmin → empty (global)
 */
export function useStaffAgencies(staffId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!staffId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('get_staff_agencies', { p_user_id: staffId })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRows([])
        } else {
          setRows(
            (data ?? []).map((r) => ({
              id: r.out_agency_id,
              name: r.out_agency_name,
            })),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [staffId])

  return { rows, loading, error }
}
