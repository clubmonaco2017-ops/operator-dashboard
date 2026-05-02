import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → number.
// Mirrors useUserOverdueCount pattern — single fetch per userId per app session,
// re-fetch on invalidate via subscribers.
const cache = new Map()
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
 * Сбросить кэш счётчика непрочитанных задач для пользователя.
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateUnreadTasksCount(userId) {
  if (userId == null) {
    cache.clear()
    notifyAll()
    return
  }
  cache.delete(userId)
  notifyAll()
}

/**
 * Полностью очистить кэш (для тестов / массовых операций).
 */
export function invalidateAllUnreadTasksCount() {
  cache.clear()
  notifyAll()
}

/**
 * Кол-во непрочитанных задач у current user (RPC count_unread_tasks).
 * Кэшируется в памяти модуля; инвалидация — invalidateUnreadTasksCount.
 *
 * @param {number|null} userId — nullable; null → returns 0 без запроса
 * @returns {{count: number, loading: boolean, reload: () => void}}
 */
export function useUnreadTasksCount(userId) {
  const [count, setCount] = useState(() =>
    userId != null && cache.has(userId) ? cache.get(userId) : 0,
  )
  const [loading, setLoading] = useState(() => userId != null && !cache.has(userId))
  const [version, setVersion] = useState(0)

  // Subscribe to cache invalidation — bump version → re-run fetch effect.
  useEffect(() => {
    const cb = () => setVersion((v) => v + 1)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (userId == null) {
      setCount(0)
      setLoading(false)
      return
    }
    if (cache.has(userId)) {
      setCount(cache.get(userId))
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const run = async () => {
      const { data, error: err } = await supabase.rpc('count_unread_tasks')
      if (cancelled) return
      if (err) {
        // Тихо: показываем 0; не кешируем.
        setCount(0)
      } else {
        const value = Number(data ?? 0)
        cache.set(userId, value)
        setCount(value)
      }
      setLoading(false)
    }

    run().catch(() => {
      if (!cancelled) {
        setCount(0)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [userId, version])

  const reload = useCallback(() => {
    if (userId != null) cache.delete(userId)
    setVersion((v) => v + 1)
  }, [userId])

  return { count, loading, reload }
}
