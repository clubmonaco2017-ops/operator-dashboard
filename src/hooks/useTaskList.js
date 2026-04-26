import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список задач (через RPC list_tasks).
 * Поиск дебаунсится 300мс, чтобы не дёргать RPC на каждый keystroke.
 *
 * @param {number|null} callerId
 * @param {object} [opts]
 * @param {'inbox'|'outbox'|'all'} [opts.box]   — default 'inbox'
 * @param {'pending'|'in_progress'|'done'|'cancelled'|'overdue'|'all'} [opts.status] — default 'all'
 * @param {string} [opts.search]
 */
export function useTaskList(callerId, opts = {}) {
  const { box = 'inbox', status = 'all', search = '' } = opts

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 300мс debounce для поиска.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_tasks', {
        p_caller_id: callerId,
        p_box: box,
        p_status: status,
        p_search: debouncedSearch ?? '',
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
  }, [callerId, box, status, debouncedSearch, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { rows, loading, error, reload }
}
