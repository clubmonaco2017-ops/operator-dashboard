import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level subscriber set — re-fetch on invalidate.
const subscribers = new Set()

function notifyAll() {
  subscribers.forEach((cb) => {
    try {
      cb()
    } catch {
      /* swallow per-subscriber errors */
    }
  })
}

/**
 * Инвалидировать список уведомлений у всех текущих подписчиков.
 * Вызывается из realtime-sync при INSERT-событиях.
 */
export function invalidateUserNotifications() {
  notifyAll()
}

/**
 * Список уведомлений текущего пользователя (RPC list_user_notifications).
 * Без модульного кэша — свежий fetch на каждый mount/invalidate.
 *
 * @param {number|null} userId — nullable; null → пустой список без запроса
 * @returns {{ rows: Array, loading: boolean, error: string|null }}
 */
export function useNotifications(userId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  // Subscribe to invalidation — bump version → re-run fetch effect.
  useEffect(() => {
    const cb = () => setVersion((v) => v + 1)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_user_notifications', { p_limit: 50 })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, version])

  return { rows, loading, error }
}
