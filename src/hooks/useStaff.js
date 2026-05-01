import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useStaff(callerId, refCode) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !refCode) return
    let cancelled = false
    setLoading(true)
    setError(null)
    // Combined view (p_agency_id = null) — detail-resolve по ref_code не должен
    // зависеть от activeAgencyId switcher'а: цель найти сотрудника во всех
    // агентствах, доступных пользователю.
    supabase
      .rpc('list_staff', { p_agency_id: null })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else {
          const match = (data ?? []).find((r) => r.ref_code === refCode)
          if (!match) {
            setError('Сотрудник не найден')
            setRow(null)
          } else {
            setRow(match)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [callerId, refCode, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { row, loading, error, reload }
}
