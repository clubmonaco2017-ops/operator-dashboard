import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → number.
// Mirrors useUnreadTasksCount pattern — single fetch per userId per app session,
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
 * Сбросить кэш счётчика непросмотренных нотификаций для пользователя.
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateNotificationsUnseenCount(userId) {
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
export function invalidateAllNotificationsUnseenCount() {
  cache.clear()
  notifyAll()
}

/**
 * Кол-во непросмотренных уведомлений у current user
 * (RPC count_user_notifications_unseen).
 *
 * @param {number|null} userId — nullable; null → returns 0 без запроса
 * @returns {number}
 */
export function useNotificationsUnseenCount(userId) {
  const [count, setCount] = useState(() =>
    userId != null && cache.has(userId) ? cache.get(userId) : 0,
  )
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
      return
    }
    if (cache.has(userId)) {
      setCount(cache.get(userId))
      return
    }

    let cancelled = false
    const run = async () => {
      const { data, error: err } = await supabase.rpc('count_user_notifications_unseen')
      if (cancelled) return
      if (err) {
        // Тихо: показываем 0; не кешируем.
        setCount(0)
      } else {
        const value = Number(data ?? 0)
        cache.set(userId, value)
        setCount(value)
      }
    }

    run().catch(() => {
      if (!cancelled) setCount(0)
    })

    return () => {
      cancelled = true
    }
  }, [userId, version])

  return count
}
