import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X, Download, Pencil, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

  // Arrow-key navigation. Esc handled by Base UI Dialog via onOpenChange.
  // Listener uses capture phase so we see ArrowLeft/Right before Base UI's
  // dialog focus-trap handlers swallow them (without capture, the keys never
  // reach the bubble phase).
  useEffect(() => {
    if (captionEditing) return // arrows do not paginate while editing caption (textarea uses arrows for caret)
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [goPrev, goNext, captionEditing])

  // Touch swipes: swipe-down closes; swipe-left/right paginates.
  // Skipped while editing caption so swipes inside textarea don't fire.
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
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    // Vertical swipe-down (close): vertical > 80px AND clearly more vertical than horizontal.
    if (dy > 80 && absY > absX * 1.5) {
      e.preventDefault() // suppress synthesized click on touch devices
      onClose()
    }
    // Horizontal swipe (paginate): horizontal > 50px AND clearly more horizontal than vertical.
    else if (absX > 50 && absX > absY * 1.5) {
      e.preventDefault()
      if (dx < 0) {
        // swipe left → next
        if (!nextDisabled) goNext()
      } else {
        // swipe right → previous
        if (!prevDisabled) goPrev()
      }
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
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (next) return
        if (captionEditing) {
          cancelCaptionEdit()
        } else {
          onClose()
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/90" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-[70] flex flex-col text-white outline-none"
          aria-label={`Просмотр: ${titleText}`}
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
                  <div role="menu" className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg bg-popover p-1 shadow-xl">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleDelete}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            )}
            <span className="mx-1 h-5 w-px bg-white/20" aria-hidden />
            <button
              type="button"
              onClick={onClose}
              autoFocus
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
                    <p className="mt-1.5 text-xs text-[var(--danger-ink)]" role="alert">{captionError}</p>
                  )}
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={saveCaption}
                      disabled={captionSaving}
                    >
                      {captionSaving ? 'Сохраняем…' : 'Сохранить'}
                    </Button>
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
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function formatRuDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
