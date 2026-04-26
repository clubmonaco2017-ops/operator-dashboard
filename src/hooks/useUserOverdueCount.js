import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → number.
// Используется Sidebar (бейдж просроченных) — без кэша был бы запрос
// на каждый рендер сайдбара.
const cache = new Map()

/**
 * Сбросить кэш счётчика для пользователя (после create/update/cancel/etc).
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateUserOverdueCount(userId) {
  if (userId == null) {
    cache.clear()
    return
  }
  cache.delete(userId)
}

/**
 * Полностью очистить кэш (например, после массовой операции).
 */
export function invalidateAllUserOverdueCount() {
  cache.clear()
}

/**
 * Кол-во просроченных задач у пользователя (RPC count_overdue_tasks).
 * Кэшируется в памяти модуля; инвалидация — invalidateUserOverdueCount.
 * Пока считается — count = 0 (не показываем устаревшее значение, если userId сменился).
 *
 * @param {number|null} userId
 * @returns {{count: number, loading: boolean, reload: () => void}}
 */
export function useUserOverdueCount(userId) {
  const [count, setCount] = useState(() =>
    userId != null && cache.has(userId) ? cache.get(userId) : 0,
  )
  const [loading, setLoading] = useState(() => userId != null && !cache.has(userId))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (userId == null) {
      setCount(0)
      setLoading(false)
      return
    }
    if (cache.has(userId) && reloadKey === 0) {
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
  }, [userId, reloadKey])

  const reload = useCallback(() => {
    if (userId != null) cache.delete(userId)
    setReloadKey((k) => k + 1)
  }, [userId])

  return { count, loading, reload }
}
