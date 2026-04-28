import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * Список media клиента (фото или видео) + actions для add/update/reorder/delete.
 *
 * @param {number|null} callerId - Hydration guard only. The RPCs derive
 *   identity server-side via current_dashboard_user_id(). This parameter
 *   is checked to prevent firing RPCs before useAuth has resolved the
 *   user — passing null causes the read effect to skip and the
 *   mutating callbacks to throw 'not authenticated'.
 * @param {number|null} clientId
 * @param {'photo'|'video'} type
 * @param {object} [opts]
 * @param {'manual'|'date_desc'|'date_asc'} [opts.sort]  — default 'manual'
 */
export function useClientMedia(callerId, clientId, type, opts = {}) {
  const { sort = 'manual' } = opts
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const id = clientId == null ? null : Number(clientId)
  const idValid = Number.isFinite(id) && id > 0

  useEffect(() => {
    if (!callerId || !idValid || !type) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_client_media', {
        p_client_id: id,
        p_type: type,
        p_sort: sort,
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
  }, [callerId, id, idValid, type, sort, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  // ---- Actions ----

  const addMedia = useCallback(
    async ({ storagePath, filename, sizeBytes, mimeType, width, height, durationMs, caption, status = 'ready' }) => {
      if (!callerId) throw new Error('unauthorized')
      const { data, error: err } = await supabase.rpc('add_client_media', {
        p_client_id: id,
        p_type: type,
        p_storage_path: storagePath,
        p_filename: filename,
        p_size_bytes: sizeBytes ?? null,
        p_mime_type: mimeType ?? null,
        p_width: width ?? null,
        p_height: height ?? null,
        p_duration_ms: durationMs ?? null,
        p_caption: caption ?? null,
        p_status: status,
      })
      if (err) throw new Error(err.message)
      reload()
      return data
    },
    [callerId, id, type, reload],
  )

  const updateMedia = useCallback(
    async (mediaId, { caption, clearCaption = false, status, errorReason, width, height, durationMs }) => {
      if (!callerId) throw new Error('unauthorized')
      const { error: err } = await supabase.rpc('update_client_media', {
        p_media_id: mediaId,
        p_caption: caption ?? null,
        p_clear_caption: clearCaption,
        p_status: status ?? null,
        p_error_reason: errorReason ?? null,
        p_width: width ?? null,
        p_height: height ?? null,
        p_duration_ms: durationMs ?? null,
      })
      if (err) throw new Error(err.message)
      reload()
    },
    [callerId, reload],
  )

  const reorderMedia = useCallback(
    async (orderedIds) => {
      if (!callerId) throw new Error('unauthorized')
      const { error: err } = await supabase.rpc('reorder_client_media', {
        p_client_id: id,
        p_type: type,
        p_ordered_ids: orderedIds,
      })
      if (err) throw new Error(err.message)
      reload()
    },
    [callerId, id, type, reload],
  )

  const deleteMedia = useCallback(
    async (mediaId) => {
      if (!callerId) throw new Error('unauthorized')
      const { data, error: err } = await supabase.rpc('delete_client_media', {
        p_media_id: mediaId,
      })
      if (err) throw new Error(err.message)
      // RPC возвращает {storage_path, type} — caller должен удалить файл из Storage
      const result = (data ?? [])[0]
      if (result?.storage_path) {
        const bucket = result.type === 'video' ? 'client-videos' : 'client-photos'
        await supabase.storage.from(bucket).remove([result.storage_path]).catch(() => {
          // tolerate file-already-gone; DB row is the source of truth
        })
      }
      reload()
    },
    [callerId, reload],
  )

  return { rows, loading, error, reload, addMedia, updateMedia, reorderMedia, deleteMedia }
}
