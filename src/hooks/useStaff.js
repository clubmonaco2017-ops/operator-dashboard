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
    supabase
      .rpc('list_staff')
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
