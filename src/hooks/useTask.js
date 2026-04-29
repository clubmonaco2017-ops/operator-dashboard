import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Деталь одной задачи (через RPC get_task_detail).
 * RPC возвращает TABLE — берём первую строку. Activity-лента включена в payload.
 *
 * @param {number|null} callerId
 * @param {number|string|null} taskId
 */
export function useTask(callerId, taskId) {
  const id = taskId == null ? null : Number(taskId)
  const idValid = Number.isFinite(id) && id > 0

  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(() => !!(callerId && idValid))
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('get_task_detail', { p_task_id: id })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else if (!data || data.length === 0) {
          setError('Задача не найдена')
          setRow(null)
        } else {
          setRow(data[0])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, id, idValid, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { row, loading, error, reload }
}
