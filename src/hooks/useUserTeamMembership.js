import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// Module-level cache: userId → boolean.
// Используется Sidebar — без кэша был бы запрос на каждый рендер.
const cache = new Map()

/**
 * Сбросить кэш для пользователя (например, после add/remove из команды).
 * Без аргумента — очистить весь кэш.
 * @param {number|null|undefined} [userId]
 */
export function invalidateUserTeamMembership(userId) {
  if (userId == null) {
    cache.clear()
    return
  }
  cache.delete(userId)
}

/**
 * Полностью очистить кэш членства (например, после archive_team,
 * когда из команды одновременно выпало много операторов).
 */
export function invalidateAllUserTeamMembership() {
  cache.clear()
}

/**
 * Состоит ли user в любой команде (через прямой select из team_members).
 * Кэшируется в памяти модуля; инвалидация — invalidateUserTeamMembership.
 *
 * @param {number|null} userId
 * @returns {{has: boolean, loading: boolean}}
 */
export function useUserTeamMembership(userId) {
  const [has, setHas] = useState(() =>
    userId != null && cache.has(userId) ? cache.get(userId) : false,
  )
  const [loading, setLoading] = useState(() => userId != null && !cache.has(userId))

  useEffect(() => {
    if (userId == null) {
      setHas(false)
      setLoading(false)
      return
    }
    if (cache.has(userId)) {
      setHas(cache.get(userId))
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const run = async () => {
      const { data, error: err } = await supabase.rpc('get_user_team_membership', {
        p_user_id: userId,
      })
      if (cancelled) return
      if (err) {
        // Тихо: на сбой считаем, что нет членства; не кешируем.
        setHas(false)
      } else {
        const value = !!data
        cache.set(userId, value)
        setHas(value)
      }
      setLoading(false)
    }

    run().catch(() => {
      if (!cancelled) {
        setHas(false)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [userId])

  return { has, loading }
}
