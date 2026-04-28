import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает список клиентов с фильтрами + счётчики по статусу.
 *
 * @param {number|null} callerId  — текущий пользователь (dashboard_users.id)
 * @param {object} [filters]
 * @param {'active'|'archived'|'all'} [filters.active]   — default 'active'
 * @param {string|null} [filters.platformId]             — uuid платформы
 * @param {string|null} [filters.agencyId]               — uuid агентства
 * @param {string} [filters.search]                      — поиск по name/alias
 */
export function useClientList(callerId, filters = {}) {
  const {
    active = 'active',
    platformId = null,
    agencyId = null,
    search = '',
  } = filters

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_clients', {
        p_filter_active: active,
        p_filter_platform: platformId,
        p_filter_agency: agencyId,
        p_search: search || null,
      })
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
  }, [callerId, active, platformId, agencyId, search, reloadKey])

  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, archived: 0 }
    for (const r of rows) {
      if (r.is_active) c.active++
      else c.archived++
    }
    return c
  }, [rows])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, counts, loading, error, reload }
}
