import { useCallback, useEffect, useState } from 'react'
import { platformApi } from '../lib/platforms.js'

/**
 * Wraps `platformApi('list')`. Returns rows + loading/error/reload.
 * REST sorts by created_at ASC; client re-sort by name (ru) для предсказуемого list'а.
 */
export function usePlatformList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await platformApi('list')
    if (err) {
      setError(err.message ?? String(err))
      setRows([])
    } else {
      setRows(
        [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload }
}
