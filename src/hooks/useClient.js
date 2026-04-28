import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Возвращает один клиент по id (через RPC get_client_detail).
 * @param {number|null} callerId
 * @param {number|string|null} clientId — может быть string из URL params
 */
export function useClient(callerId, clientId) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const id = clientId == null ? null : Number(clientId)
  const idValid = Number.isFinite(id) && id > 0

  useEffect(() => {
    if (!callerId || !idValid) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('get_client_detail', { p_client_id: id })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else if (!data || data.length === 0) {
          setError('Клиент не найден')
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
