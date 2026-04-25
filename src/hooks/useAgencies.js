import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список агентств (lookup для фильтров и Create slide-out).
 * @param {object} [opts]
 * @param {string|null} [opts.platformId] — фильтр по платформе (для каскадного select)
 */
export function useAgencies(opts = {}) {
  const { platformId = null } = opts
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let q = supabase.from('agencies').select('id, name, platform_id').order('name', { ascending: true })
    if (platformId) q = q.eq('platform_id', platformId)
    q.then(({ data, error: err }) => {
      if (cancelled) return
      if (err) {
        setError(err.message)
        setRows([])
      } else {
        setRows(data ?? [])
      }
    }).then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [platformId])

  return { rows, loading, error }
}
