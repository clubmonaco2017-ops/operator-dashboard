import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * События команды (правая колонка «Активность») с пагинацией.
 *
 * @param {number|null} callerId — retained as null-guard; RPC derives identity from JWT
 * @param {number|string|null} teamId
 * @param {number} [limit] — default 12
 */
export function useTeamActivity(callerId, teamId, limit = 12) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [offset, setOffset] = useState(0)

  // Counter to detect concurrent reloads / teamId changes that
  // should cancel an in-flight loadMore.
  const requestIdRef = useRef(0)

  const id = teamId == null ? null : Number(teamId)
  const idValid = Number.isFinite(id) && id > 0

  // Первичный fetch (offset = 0).
  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    requestIdRef.current += 1
    setLoading(true)
    setError(null)
    setOffset(0)

    supabase
      .rpc('list_team_activity', {
        p_team_id: id,
        p_limit: limit,
        p_offset: 0,
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
  }, [callerId, id, idValid, limit, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const loadMore = useCallback(async () => {
    if (!callerId || !idValid) return
    if (loadingMore || loading) return

    const nextOffset = offset + limit
    const myRequestId = requestIdRef.current
    setLoadingMore(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('list_team_activity', {
        p_team_id: id,
        p_limit: limit,
        p_offset: nextOffset,
      })
      // Bail if a reload / teamId change happened during the fetch.
      if (myRequestId !== requestIdRef.current) return
      if (err) {
        setError(err.message)
        return
      }
      const newRows = data ?? []
      setRows((prev) => [...prev, ...newRows])
      setOffset(nextOffset)
    } finally {
      setLoadingMore(false)
    }
  }, [callerId, id, idValid, limit, offset, loadingMore, loading])

  return { rows, loading, loadingMore, error, reload, loadMore }
}
