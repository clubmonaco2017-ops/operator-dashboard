import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список платформ (lookup для фильтров и Create slide-out).
 * Кешируется один раз за жизнь компонента — новые платформы добавляются редко.
 */
export function usePlatforms() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('platforms')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
      })
      .then(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { rows, loading, error }
}
