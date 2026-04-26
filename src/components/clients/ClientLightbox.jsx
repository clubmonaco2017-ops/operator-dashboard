import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Download, Pencil, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { formatFileSize, formatDuration } from '../../lib/clients.js'

/**
 * Полноэкранный просмотр фото или видео.
 * Универсальный — определяет type по `items[index].type`.
 *
 * @param {object} props
 * @param {Array} props.items — массив client_media row, отфильтрованных по типу
 * @param {number} props.initialIndex
 * @param {function} props.onClose
 * @param {function} [props.onDelete] — (mediaId) => Promise; если задан — показываем кнопку Удалить в `…`
 * @param {function} [props.onUpdateCaption] — (mediaId, caption|null) => Promise; если задан — показываем pencil
 */
export function ClientLightbox({ items, initialIndex = 0, onClose, onDelete, onUpdateCaption }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, items.length - 1)))
  const [menuOpen, setMenuOpen] = useState(false)

  // 8.D: caption edit mode
  const [captionEditing, setCaptionEditing] = useState(false)
  const [captionDraft, setCaptionDraft] = useState('')
  const [captionSaving, setCaptionSaving] = useState(false)
  const [captionError, setCaptionError] = useState(null)
  const captionRef = useRef(null)

  // 8.F: long-caption expand
  const [captionExpanded, setCaptionExpanded] = useState(false)

  const current = items[index]
  const prevDisabled = index <= 0
  const nextDisabled = index >= items.length - 1

  const closeBtnRef = useRef(null)
  const previouslyFocused = useRef(null)
  const dialogRef = useRef(null)

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
    setMenuOpen(false)
    setCaptionEditing(false)
    setCaptionExpanded(false)
  }, [])
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(items.length - 1, i + 1))
    setMenuOpen(false)
    setCaptionEditing(false)
    setCaptionExpanded(false)
  }, [items.length])

  // Hotkeys (Esc, ←, →) — но только когда не редактируем caption
  useEffect(() => {
    const onKey = (e) => {
      // 8.D: в caption-edit Esc отменяет edit, не закрывает lightbox
      if (captionEditing) {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancelCaptionEdit()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goPrev, goNext, onClose, captionEditing])

  // 8.G: focus management — fokus на закрытие при открытии, восстановить при закрытии
  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeBtnRef.current?.focus()
    return () => {
      try {
        previouslyFocused.current?.focus?.()
      } catch {
        /* element may be unmounted */
      }
    }
  }, [])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // 8.H: touch swipe-down to close
  const touchStartY = useRef(null)
  const touchStartX = useRef(null)
  const onTouchStart = (e) => {
    if (captionEditing) return
    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
  }
  const onTouchEnd = (e) => {
    if (touchStartY.current == null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const dx = e.changedTouches[0].clientX - (touchStartX.current ?? 0)
    // swipe down dominates: vertical > 80px и больше горизонтального
    if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      onClose()
    }
    touchStartY.current = null
    touchStartX.current = null
  }

  const url = useMemo(() => {
    if (!current) return ''
    // Subplan 5+: each item can specify its own bucket (e.g. 'task-reports').
    // Subplan 3 fallback: derive bucket from media type.
    const bucket =
      current.bucket || (current.type === 'video' ? 'client-videos' : 'client-photos')
    return supabase.storage.from(bucket).getPublicUrl(current.storage_path).data.publicUrl
  }, [current])

  // Reset caption draft when current item changes
  useEffect(() => {
    setCaptionDraft(current?.caption ?? '')
    setCaptionError(null)
  }, [current?.id, current?.caption])

  // Focus textarea on enter edit-mode
  useEffect(() => {
    if (captionEditing) {
      captionRef.current?.focus()
      const len = captionRef.current?.value.length ?? 0
      captionRef.current?.setSelectionRange(len, len)
    }
  }, [captionEditing])

  if (!current) return null

  const meta = [
    formatRuDate(current.created_at),
    current.width && current.height ? `${current.width} × ${current.height}` : null,
    formatFileSize(current.size_bytes),
    current.duration_ms ? formatDuration(current.duration_ms) : null,
    current.mime_type ? current.mime_type.split('/')[1]?.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const captionText = current.caption || ''
  const showFilenameAsTitle = !captionText
  const titleText = captionText || current.filename
  const isLongCaption = captionText.length > 140

  async function handleDelete() {
    if (!onDelete) return
    if (!confirm(`Удалить ${current.type === 'video' ? 'видео' : 'фото'} «${current.filename}»?`)) return
    await onDelete(current.id)
    setMenuOpen(false)
    if (items.length === 1) {
      onClose()
    } else if (index === items.length - 1) {
      setIndex((i) => i - 1)
    }
  }

  function startCaptionEdit() {
    if (!onUpdateCaption) return
    setCaptionDraft(current.caption ?? '')
    setCaptionEditing(true)
    setCaptionError(null)
    setCaptionExpanded(true)
  }

  function cancelCaptionEdit() {
    setCaptionEditing(false)
    setCaptionDraft(current.caption ?? '')
    setCaptionError(null)
  }

  async function saveCaption() {
    if (!onUpdateCaption) return
    const next = captionDraft.trim()
    const cur = (current.caption ?? '').trim()
    if (next === cur) {
      setCaptionEditing(false)
      return
    }
    setCaptionSaving(true)
    setCaptionError(null)
    try {
      await onUpdateCaption(current.id, next || null)
      setCaptionEditing(false)
    } catch (e) {
      setCaptionError(e.message || String(e))
    } finally {
      setCaptionSaving(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[70] bg-black/90 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр: ${titleText}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top toolbar */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {onUpdateCaption && !captionEditing && (
          <button
            type="button"
            onClick={startCaptionEdit}
            className="rounded-md bg-white/10 p-2 text-white/90 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
            title="Редактировать подпись"
            aria-label="Редактировать подпись"
          >
            <Pencil size={16} />
          </button>
        )}
        <a
          href={url}
          download={current.filename}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-white/10 p-2 text-white/90 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          title="Скачать"
          aria-label="Скачать файл"
        >
          <Download size={16} />
        </a>
        {onDelete && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md bg-white/10 p-2 text-white/90 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              aria-label="Дополнительные действия"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg bg-slate-800 p-1 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleDelete}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/15"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
        <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="rounded-md bg-white/10 p-2 text-white/90 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
          aria-label="Закрыть просмотр"
        >
          <X size={18} />
        </button>
      </div>

      {/* Counter top-left */}
      <div
        className="absolute left-4 top-4 z-10 rounded-md bg-white/10 px-2.5 py-1 font-mono text-xs text-white/80 tabular"
        aria-label={`${index + 1} из ${items.length}`}
      >
        {index + 1} / {items.length}
      </div>

      {/* Prev / Next */}
      <button
        type="button"
        onClick={goPrev}
        disabled={prevDisabled}
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-white/10 p-3 text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
        aria-label="Предыдущее"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={nextDisabled}
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-white/10 p-3 text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
        aria-label="Следующее"
      >
        <ChevronRight size={22} />
      </button>

      {/* Media */}
      <div className="flex h-full flex-col items-center justify-center px-4 py-12 sm:px-16">
        {current.type === 'video' ? (
          <video
            key={current.id}
            src={url}
            controls
            playsInline
            muted
            className="max-h-[calc(100vh-220px)] max-w-full"
            aria-label={titleText}
          />
        ) : (
          <img
            src={url}
            alt={titleText}
            className="max-h-[calc(100vh-220px)] max-w-full object-contain"
          />
        )}

        {/* Caption + meta */}
        <div className="mt-5 max-w-3xl text-center">
          {captionEditing ? (
            <div className="mx-auto max-w-xl">
              <textarea
                ref={captionRef}
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    saveCaption()
                  }
                }}
                disabled={captionSaving}
                rows={3}
                placeholder="Подпись (опционально)"
                aria-label="Подпись к файлу"
                maxLength={500}
                className="block w-full resize-y rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/40"
              />
              {captionError && (
                <p className="mt-1.5 text-xs text-red-300" role="alert">{captionError}</p>
              )}
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={saveCaption}
                  disabled={captionSaving}
                  className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-white/90 disabled:opacity-60"
                >
                  {captionSaving ? 'Сохраняем…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={cancelCaptionEdit}
                  disabled={captionSaving}
                  className="rounded-md border border-white/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Отмена
                </button>
                <span className="ml-2 hidden text-[10px] text-white/40 sm:inline">
                  ⌘↵ сохранить · Esc отмена
                </span>
              </div>
            </div>
          ) : (
            <>
              <p
                className={[
                  'text-base font-semibold text-white',
                  showFilenameAsTitle ? 'opacity-70' : '',
                  isLongCaption && !captionExpanded ? 'line-clamp-2' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {titleText}
              </p>
              {isLongCaption && (
                <button
                  type="button"
                  onClick={() => setCaptionExpanded((v) => !v)}
                  className="mt-1 text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
                  aria-expanded={captionExpanded}
                >
                  {captionExpanded ? 'Свернуть' : 'Подробнее'}
                </button>
              )}
              <p className="mt-1 font-mono text-xs text-white/60 tabular">{meta}</p>
            </>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/50">
        <kbd className="mx-0.5 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono">
          ←
        </kbd>
        <kbd className="mx-0.5 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono">
          →
        </kbd>{' '}
        навигация ·{' '}
        <kbd className="mx-0.5 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono">
          Esc
        </kbd>{' '}
        закрыть
      </div>
    </div>
  )
}

function formatRuDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
