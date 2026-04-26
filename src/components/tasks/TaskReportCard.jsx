import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Play, Upload, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { useTaskActions } from '../../hooks/useTaskActions.js'
import {
  canEditTask,
  canSubmitReport,
  validateReport,
} from '../../lib/tasks.js'
import { uploadWithRetry } from '../../lib/upload.js'
import {
  FILE_LIMITS,
  formatDuration,
  formatFileSize,
  validateFile,
} from '../../lib/clients.js'
import { ClientLightbox } from '../clients/ClientLightbox.jsx'

const ACCEPTED_MIME = [
  ...FILE_LIMITS.photo.mimeTypes,
  ...FILE_LIMITS.video.mimeTypes,
]

/**
 * Карточка «Отчёт» в TaskDetailPanel.
 *
 * Условный рендер по статусу:
 *  - pending           → подсказка
 *  - in_progress + me  → форма (текст + media + submit)
 *  - in_progress + ¬me → ждём отчёт от исполнителя
 *  - done              → display, при правах reporter — edit
 *  - cancelled         → подсказка «Задача отменена»
 */
export function TaskReportCard({ callerId, user, task, onChanged }) {
  const status = task.status

  return (
    <section id="task-report" className="surface-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label-caps">Отчёт</h3>
      </header>
      {status === 'pending' ? (
        <p className="text-sm italic text-[var(--fg4)]">
          Отчёт появится после взятия в работу.
        </p>
      ) : status === 'cancelled' ? (
        <p className="text-sm italic text-[var(--fg4)]">Задача отменена.</p>
      ) : status === 'in_progress' ? (
        canSubmitReport(user, task) ? (
          <ReportForm
            mode="submit"
            callerId={callerId}
            task={task}
            initialContent=""
            initialMedia={[]}
            onChanged={onChanged}
          />
        ) : (
          <p className="text-sm italic text-[var(--fg4)]">
            Ждём отчёта от {task.assigned_to_name ?? 'исполнителя'}.
          </p>
        )
      ) : status === 'done' ? (
        <ReportDoneView
          callerId={callerId}
          user={user}
          task={task}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  )
}

// ============================================================================
// Done view (display + optional edit by original reporter)
// ============================================================================

function ReportDoneView({ callerId, user, task, onChanged }) {
  const [editing, setEditing] = useState(false)
  const report = task.report
  const canEdit =
    canEditTask(user, task) &&
    !!report &&
    report.reporter_id === user?.id

  if (!report) {
    return (
      <p className="text-sm italic text-[var(--fg4)]">
        Отчёт не найден.
      </p>
    )
  }

  if (editing) {
    return (
      <ReportForm
        mode="update"
        callerId={callerId}
        task={task}
        initialContent={report.content || ''}
        initialMedia={Array.isArray(report.media) ? report.media : []}
        onChanged={() => {
          setEditing(false)
          onChanged?.()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {report.content ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--fg2)]">
              {report.content}
            </p>
          ) : (
            <p className="text-sm italic text-[var(--fg4)]">Без описания</p>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground focus-ds"
            aria-label="Редактировать отчёт"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
      <ReportMediaGallery media={Array.isArray(report.media) ? report.media : []} />
      <p className="text-xs text-[var(--fg4)]">
        Отчёт от{' '}
        <span className="font-medium text-foreground">
          {report.reporter_name ?? '—'}
        </span>
      </p>
    </div>
  )
}

// ============================================================================
// Media gallery (read-only, opens lightbox)
// ============================================================================

function ReportMediaGallery({ media }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  if (!media || media.length === 0) return null

  // Adapt to Lightbox shape: ensure id (use idx as fallback), bucket, type
  const items = media.map((m, i) => ({
    id: m.id ?? `media-${i}`,
    type: m.type === 'video' ? 'video' : 'image',
    bucket: m.bucket || 'task-reports',
    storage_path: m.storage_path,
    filename: m.filename,
    size_bytes: m.size_bytes,
    mime_type: m.mime_type,
    width: m.width ?? null,
    height: m.height ?? null,
    duration_ms: m.duration_ms ?? null,
    caption: m.caption ?? null,
    created_at: m.created_at ?? null,
  }))

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((m, idx) => (
          <ReportMediaTile
            key={m.id}
            media={m}
            onOpen={() => setLightboxIndex(idx)}
          />
        ))}
      </div>
      {lightboxIndex !== null && (
        <ClientLightbox
          items={items.map((it) => ({
            ...it,
            // Lightbox uses item.type === 'video' for video element. 'image' or other → img.
            type: it.type === 'video' ? 'video' : 'photo',
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

function ReportMediaTile({ media, onOpen }) {
  const url =
    supabase.storage.from(media.bucket).getPublicUrl(media.storage_path)?.data?.publicUrl ?? ''
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ aspectRatio: '4 / 3' }}
      aria-label={`Открыть: ${media.filename}`}
    >
      {media.type === 'video' ? (
        <>
          <video
            src={url}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/60 p-2 text-white">
              <Play size={16} />
            </span>
          </span>
          {media.duration_ms && (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] text-white">
              {formatDuration(media.duration_ms)}
            </span>
          )}
        </>
      ) : url ? (
        <img
          src={url}
          alt={media.filename}
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--fg4)]">
          no preview
        </div>
      )}
    </button>
  )
}

// ============================================================================
// Form (submit OR update)
// ============================================================================

function ReportForm({
  mode,
  callerId,
  task,
  initialContent,
  initialMedia,
  onChanged,
  onCancel,
}) {
  const { submitReport, updateReport } = useTaskActions(callerId)
  const [content, setContent] = useState(initialContent ?? '')
  const [media, setMedia] = useState(() => normalizeMedia(initialMedia))
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [uploading, setUploading] = useState(null) // { current, currentIndex, total, currentBytes, currentTotal, retrying }
  const [uploadErrors, setUploadErrors] = useState([])
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return
      const queue = Array.from(files)
      const errs = []
      setUploadErrors([])

      setUploading({
        current: queue[0],
        currentIndex: 0,
        total: queue.length,
        currentBytes: 0,
        currentTotal: queue[0]?.size || 0,
        retrying: false,
      })

      for (let i = 0; i < queue.length; i++) {
        const f = queue[i]
        const isVideo = f.type.startsWith('video/')
        const kind = isVideo ? 'video' : 'photo'
        setUploading((u) =>
          u
            ? {
                ...u,
                current: f,
                currentIndex: i,
                currentBytes: 0,
                currentTotal: f.size,
                retrying: false,
              }
            : u,
        )
        const v = validateFile(f, kind)
        if (!v.valid) {
          errs.push({ filename: f.name, error: v.error })
          continue
        }
        try {
          const ext = f.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg')
          const path = `${task.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          await uploadWithRetry(
            'task-reports',
            path,
            f,
            (loaded, total) => {
              setUploading((u) => (u ? { ...u, currentBytes: loaded, currentTotal: total } : u))
            },
            () => setUploading((u) => (u ? { ...u, retrying: true } : u)),
          )
          let dims = { width: null, height: null }
          let durationMs = null
          if (isVideo) {
            const meta = await readVideoMetadata(f).catch(() => ({
              width: null,
              height: null,
              durationMs: null,
            }))
            dims = { width: meta.width, height: meta.height }
            durationMs = meta.durationMs
          } else {
            dims = await readImageDimensions(f).catch(() => ({ width: null, height: null }))
          }

          setMedia((m) => [
            ...m,
            {
              type: isVideo ? 'video' : 'image',
              storage_path: path,
              filename: f.name,
              size_bytes: f.size,
              mime_type: f.type,
              width: dims.width,
              height: dims.height,
              duration_ms: durationMs,
            },
          ])
        } catch (e) {
          errs.push({ filename: f.name, error: e.message })
        }
      }

      setUploading(null)
      setUploadErrors(errs)
    },
    [task.id],
  )

  // Drop overlay
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    function hasFiles(e) {
      return Array.from(e.dataTransfer?.types || []).includes('Files')
    }
    function onEnter(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragActive(true)
    }
    function onOver(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    function onLeave(e) {
      if (!hasFiles(e)) return
      dragDepth.current -= 1
      if (dragDepth.current <= 0) {
        dragDepth.current = 0
        setDragActive(false)
      }
    }
    function onDrop(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragActive(false)
      handleFiles(Array.from(e.dataTransfer.files))
    }
    el.addEventListener('dragenter', onEnter)
    el.addEventListener('dragover', onOver)
    el.addEventListener('dragleave', onLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onEnter)
      el.removeEventListener('dragover', onOver)
      el.removeEventListener('dragleave', onLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  function removeMedia(idx) {
    const removed = media[idx]
    setMedia((m) => m.filter((_, i) => i !== idx))
    // Best-effort cleanup из Storage (только для свежезагруженных без id).
    if (removed && !removed.id && removed.storage_path) {
      supabase.storage.from('task-reports').remove([removed.storage_path]).catch(() => {})
    }
  }

  async function handleSubmit() {
    const trimmed = content.trim()
    const v = validateReport(trimmed, media)
    if (!v.valid) {
      setError(v.error)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = { content: trimmed || null, media: stripForRpc(media) }
      if (mode === 'submit') {
        await submitReport(task.id, payload)
      } else {
        await updateReport(task.id, payload)
      }
      onChanged?.()
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  const isUploading = uploading !== null
  const submitDisabled = submitting || isUploading

  return (
    <div ref={dropRef} className="relative space-y-3">
      <div>
        <label htmlFor="report-content" className="mb-1 block label-caps">
          Описание выполнения
        </label>
        <textarea
          id="report-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={submitting}
          rows={4}
          placeholder="Что сделано, ссылки, заметки…"
          className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-[var(--fg4)] focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
        />
      </div>

      {/* Media grid */}
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {media.map((m, idx) => (
            <MediaUploadTile
              key={`${m.storage_path}-${idx}`}
              media={m}
              onRemove={() => removeMedia(idx)}
              disabled={submitting || isUploading}
            />
          ))}
        </div>
      )}

      {/* Drop zone / picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MIME.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || submitting}
          className="btn-ghost text-xs"
        >
          <Upload size={14} /> Прикрепить файл
        </button>
        <span className="ml-2 text-xs text-muted-foreground">
          или перетащите · фото до 25 МБ · видео до 500 МБ
        </span>
      </div>

      {/* Upload progress */}
      {uploading && (
        <UploadProgress upload={uploading} />
      )}

      {/* Upload errors */}
      {uploadErrors.length > 0 && (
        <div
          className="rounded-md border border-[var(--warning-soft)] bg-card p-2"
          role="alert"
        >
          <p className="text-xs font-medium text-[var(--warning-ink)]">
            Не удалось загрузить {uploadErrors.length} файл(ов):
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--danger-ink)]">
            {uploadErrors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.filename}</span>: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-xs text-[var(--danger-ink)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className="btn-primary"
        >
          {submitting
            ? 'Отправляем…'
            : mode === 'submit'
              ? 'Завершить с отчётом'
              : 'Сохранить изменения'}
        </button>
        {mode === 'update' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-ghost"
          >
            Отмена
          </button>
        )}
      </div>

      {dragActive && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-[var(--primary-soft)]/40"
          aria-hidden
        >
          <p className="text-sm font-medium text-[var(--primary-ink)]">
            Отпустите, чтобы прикрепить
          </p>
        </div>
      )}
    </div>
  )
}

function MediaUploadTile({ media, onRemove, disabled }) {
  const url =
    supabase.storage.from('task-reports').getPublicUrl(media.storage_path)?.data?.publicUrl ?? ''
  const isVideo = media.type === 'video'
  return (
    <div
      className="group relative overflow-hidden rounded-lg bg-muted"
      style={{ aspectRatio: '4 / 3' }}
    >
      {isVideo ? (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : url ? (
        <img
          src={url}
          alt={media.filename}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : null}
      <span className="pointer-events-none absolute bottom-1 left-1 max-w-[80%] truncate rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] text-white">
        {media.filename}
      </span>
      {isVideo && media.duration_ms && (
        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 font-mono text-[10px] text-white">
          {formatDuration(media.duration_ms)}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title={`Убрать ${media.filename}`}
        aria-label={`Убрать ${media.filename}`}
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition-opacity hover:bg-black/90 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
      >
        <X size={10} />
      </button>
    </div>
  )
}

function UploadProgress({ upload }) {
  const value =
    upload.currentTotal > 0
      ? Math.min(100, Math.max(0, (upload.currentBytes / upload.currentTotal) * 100))
      : 0
  return (
    <div
      className="rounded-md border border-[var(--primary-soft)] bg-card p-2"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-medium text-foreground">
        {upload.retrying
          ? `Повтор · файл ${upload.currentIndex + 1} из ${upload.total}`
          : `Загружается ${upload.currentIndex + 1} из ${upload.total}`}
        {upload.current?.name && (
          <span className="ml-1 truncate font-mono text-[10px] text-muted-foreground">
            · {upload.current.name}
          </span>
        )}
      </p>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--primary-soft)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        {formatFileSize(upload.currentBytes)} / {formatFileSize(upload.currentTotal)}
      </p>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeMedia(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map((m) => ({
    id: m.id ?? null,
    type: m.type === 'video' ? 'video' : 'image',
    storage_path: m.storage_path,
    filename: m.filename,
    size_bytes: m.size_bytes,
    mime_type: m.mime_type,
    width: m.width ?? null,
    height: m.height ?? null,
    duration_ms: m.duration_ms ?? null,
  }))
}

/**
 * Strip helper-only fields (id, etc.) before sending to RPC.
 */
function stripForRpc(arr) {
  return arr.map((m) => ({
    type: m.type,
    storage_path: m.storage_path,
    filename: m.filename,
    size_bytes: m.size_bytes,
    mime_type: m.mime_type,
    width: m.width ?? null,
    height: m.height ?? null,
    duration_ms: m.duration_ms ?? null,
  }))
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const r = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(r)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const r = {
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationMs: Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : null,
      }
      URL.revokeObjectURL(url)
      resolve(r)
    }
    video.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    video.src = url
  })
}

