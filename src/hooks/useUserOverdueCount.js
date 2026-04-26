import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → number.
// Используется Sidebar (бейдж просроченных) — без кэша был бы запрос
// на каждый рендер сайдбара.
const cache = new Map()

// Module-level subscriber set — нужен, чтобы invalidate*() уведомлял
// уже смонтированные инстансы хука и они перезагрузили счётчик
// (иначе Sidebar показывал бы устаревшее значение до перезагрузки страницы).
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
 * Сбросить кэш счётчика для пользователя (после create/update/cancel/etc).
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateUserOverdueCount(userId) {
  if (userId == null) {
    cache.clear()
    notifyAll()
    return
  }
  cache.delete(userId)
  notifyAll()
}

/**
 * Полностью очистить кэш (например, после массовой операции).
 */
export function invalidateAllUserOverdueCount() {
  cache.clear()
  notifyAll()
}

/**
 * Кол-во просроченных задач у пользователя (RPC count_overdue_tasks).
 * Кэшируется в памяти модуля; инвалидация — invalidateUserOverdueCount.
 * Подписан на module-level notifyAll, поэтому после invalidate перезагружается
 * автоматически без перезагрузки страницы.
 *
 * @param {number|null} userId
 * @returns {{count: number, loading: boolean, reload: () => void}}
 */
export function useUserOverdueCount(userId) {
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
      const { data, error: err } = await supabase.rpc('count_overdue_tasks', {
        p_caller_id: userId,
      })
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
