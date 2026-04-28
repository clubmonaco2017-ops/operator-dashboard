import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload,
  GripVertical,
  Calendar,
  Image as ImageIcon,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Maximize2,
  MoreHorizontal,
  CheckSquare,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { supabase } from '../../supabaseClient.js'
import { useClientMedia } from '../../hooks/useClientMedia.js'
import { validateFile, FILE_LIMITS, formatFileSize } from '../../lib/clients.js'
import { uploadWithRetry } from '../../lib/upload.js'
import { ClientLightbox } from './ClientLightbox.jsx'
import { DropOverlay } from './DropOverlay.jsx'
import { BulkActionBar } from './BulkActionBar.jsx'

/**
 * Таб «Фото» — masonry-grid + upload + lightbox.
 * Drag-reorder и bulk-select — Stage 6.2 / 6.3.
 */
export function PhotoGalleryTab({ callerId, client, onChanged }) {
  const [sort, setSort] = useState('manual') // 'manual' | 'date_desc'
  const { rows, loading, error, addMedia, updateMedia, deleteMedia, reorderMedia, reload } =
    useClientMedia(callerId, client.id, 'photo', { sort })

  // Локальный override для optimistic reorder (отображается до завершения RPC)
  const [optimisticOrder, setOptimisticOrder] = useState(null)
  const displayRows = useMemo(() => {
    if (!optimisticOrder) return rows
    const map = new Map(rows.map((r) => [r.id, r]))
    return optimisticOrder.map((id) => map.get(id)).filter(Boolean)
  }, [rows, optimisticOrder])

  // Сбрасываем optimistic order когда server-state догнал
  useEffect(() => {
    if (!optimisticOrder) return
    const sameOrder =
      rows.length === optimisticOrder.length &&
      rows.every((r, i) => r.id === optimisticOrder[i])
    if (sameOrder) setOptimisticOrder(null)
  }, [rows, optimisticOrder])

  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [dragReject, setDragReject] = useState(null) // null | 'mime' | 'size'
  const [pendingCount, setPendingCount] = useState(0)
  const [upload, setUpload] = useState(null) // null | { current, currentIndex, total, errors: [] }
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)
  const dragDepth = useRef(0)

  // Bulk select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const allIds = useMemo(() => displayRows.map((r) => r.id), [displayRows])
  const allSelected = selectedIds.size > 0 && selectedIds.size === allIds.length
  const [bulkBusy, setBulkBusy] = useState(false)

  function toggleSelectMode() {
    if (selectMode) {
      setSelectMode(false)
      setSelectedIds(new Set())
    } else {
      setSelectMode(true)
    }
  }
  function toggleId(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAll() {
    setSelectedIds(new Set(allIds))
  }
  function clearAll() {
    setSelectedIds(new Set())
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Удалить ${selectedIds.size} фото? Это действие необратимо.`)) return
    setBulkBusy(true)
    const ids = Array.from(selectedIds)
    let failed = 0
    for (const id of ids) {
      try {
        await deleteMedia(id)
      } catch {
        failed += 1
      }
    }
    setSelectedIds(new Set())
    setBulkBusy(false)
    onChanged?.()
    if (failed > 0) alert(`Не удалось удалить ${failed} из ${ids.length}`)
  }

  function bulkDownload() {
    if (selectedIds.size === 0) return
    const idSet = selectedIds
    const targets = displayRows.filter((m) => idSet.has(m.id))
    targets.forEach((m, i) => {
      const url = supabase.storage.from('client-photos').getPublicUrl(m.storage_path)?.data?.publicUrl
      if (!url) return
      // Открываем downloads с интервалом чтобы браузер не блокировал
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = url
        a.download = m.filename
        a.target = '_blank'
        a.rel = 'noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 80)
    })
  }

  // Sensors для @dnd-kit. PointerSensor с distance=6 чтобы простой click не превращался в drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayRows.findIndex((r) => r.id === active.id)
    const newIndex = displayRows.findIndex((r) => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const newOrder = arrayMove(displayRows, oldIndex, newIndex).map((r) => r.id)
    setOptimisticOrder(newOrder)
    try {
      await reorderMedia(newOrder)
      onChanged?.()
    } catch (e) {
      alert(`Не удалось сохранить порядок: ${e.message}`)
      setOptimisticOrder(null)
      reload()
    }
  }

  // ---- Drop overlay (drag from OS) ----
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function hasFiles(e) {
      return Array.from(e.dataTransfer?.types || []).includes('Files')
    }

    function onDragEnter(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      const items = e.dataTransfer.items
      const count = items?.length || 0
      setPendingCount(count)
      // Quick guess at reject: check first item kind/type
      const firstItem = items?.[0]
      if (firstItem && !FILE_LIMITS.photo.mimeTypes.includes(firstItem.type)) {
        setDragReject('mime')
      } else {
        setDragReject(null)
      }
      setDragActive(true)
    }
    function onDragOver(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    function onDragLeave(e) {
      if (!hasFiles(e)) return
      dragDepth.current -= 1
      if (dragDepth.current <= 0) {
        dragDepth.current = 0
        setDragActive(false)
        setDragReject(null)
      }
    }
    function onDrop(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragActive(false)
      setDragReject(null)
      const files = Array.from(e.dataTransfer.files)
      handleFiles(files)
    }

    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Upload ----
  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return
      const queue = Array.from(files)
      const errors = []
      setUpload({
        current: queue[0],
        currentIndex: 0,
        total: queue.length,
        currentBytes: 0,
        currentTotal: queue[0]?.size || 0,
        errors: [],
        retrying: false,
      })

      for (let i = 0; i < queue.length; i++) {
        const f = queue[i]
        setUpload((u) =>
          u ? { ...u, current: f, currentIndex: i, currentBytes: 0, currentTotal: f.size, retrying: false } : u,
        )
        const v = validateFile(f, 'photo')
        if (!v.valid) {
          errors.push({ filename: f.name, error: v.error })
          continue
        }
        try {
          const ext = f.name.split('.').pop()?.toLowerCase() || 'jpg'
          const path = `${client.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          // 8.C: одна автоматическая попытка retry на network errors
          await uploadWithRetry(
            'client-photos',
            path,
            f,
            (loaded, total) => {
              setUpload((u) => (u ? { ...u, currentBytes: loaded, currentTotal: total } : u))
            },
            () => setUpload((u) => (u ? { ...u, retrying: true } : u)),
          )

          const dimensions = await readImageDimensions(f).catch(() => ({ width: null, height: null }))
          await addMedia({
            storagePath: path,
            filename: f.name,
            sizeBytes: f.size,
            mimeType: f.type,
            width: dimensions.width,
            height: dimensions.height,
          })
        } catch (err) {
          errors.push({ filename: f.name, error: err.message })
        }
      }

      setUpload({ current: null, currentIndex: queue.length, total: queue.length, errors, done: true })
      onChanged?.()

      if (errors.length === 0) {
        // success — auto-fade banner после 2 сек
        setTimeout(() => setUpload(null), 2000)
      }
    },
    [client.id, addMedia, onChanged],
  )

  const onPickClick = () => fileInputRef.current?.click()
  const onFileInputChange = (e) => {
    const files = e.target.files
    if (files?.length) handleFiles(files)
    e.target.value = ''
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept={FILE_LIMITS.photo.mimeTypes.join(',')}
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      <section className="surface-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <SortToggle value={sort} onChange={setSort} disabled={selectMode} />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={toggleSelectMode}
              aria-pressed={selectMode}
              className={selectMode ? 'bg-foreground text-background hover:opacity-90' : undefined}
            >
              {selectMode ? <Check size={16} /> : <CheckSquare size={14} />}
              {selectMode ? 'Готово' : 'Выбрать'}
            </Button>
            <Button
              onClick={onPickClick}
              disabled={!!upload && !upload.done}
            >
              <Upload size={14} /> Загрузить
            </Button>
          </div>
        </header>

        <div className="p-5">
          {selectMode && (
            <BulkActionBar
              selectedCount={selectedIds.size}
              totalCount={allIds.length}
              allSelected={allSelected}
              busy={bulkBusy}
              onSelectAll={selectAll}
              onClearAll={clearAll}
              onDownload={bulkDownload}
              onDelete={bulkDelete}
            />
          )}

          <p className="mb-3 text-xs text-muted-foreground">
            До 25 МБ · форматы: JPG, PNG, WEBP · drag-and-drop поддерживается
          </p>

          {upload && <UploadBanner upload={upload} onClose={() => setUpload(null)} />}

          {loading && rows.length === 0 ? (
            <GridSkeletonWithSlowHint />
          ) : error ? (
            <p className="text-sm text-[var(--danger-ink)]" role="alert">Ошибка: {error}</p>
          ) : displayRows.length === 0 ? (
            <EmptyPhotos onUpload={onPickClick} />
          ) : (
            <PhotoGrid
              rows={displayRows}
              sortable={sort === 'manual' && !selectMode}
              sensors={sensors}
              onDragEnd={handleDragEnd}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggle={toggleId}
              onOpen={(idx) => setLightboxIndex(idx)}
              onDelete={async (media) => {
                try {
                  await deleteMedia(media.id)
                  onChanged?.()
                } catch (e) {
                  alert(`Не удалось удалить: ${e.message}`)
                }
              }}
            />
          )}
        </div>
      </section>

      {dragActive && (
        <DropOverlay
          fileCount={pendingCount}
          type="photo"
          reject={dragReject !== null}
          rejectMessage={
            dragReject === 'mime' ? 'Поддерживаются JPG · PNG · WEBP' : null
          }
        />
      )}

      {lightboxIndex !== null && (
        <ClientLightbox
          items={displayRows}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDelete={async (id) => {
            await deleteMedia(id)
            onChanged?.()
          }}
          onUpdateCaption={async (id, caption) => {
            await updateMedia(id, { caption: caption ?? '', clearCaption: !caption })
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function SortToggle({ value, onChange, disabled }) {
  const opts = [
    { key: 'manual', label: 'Вручную', icon: <GripVertical size={12} /> },
    { key: 'date_desc', label: 'По дате', icon: <Calendar size={12} /> },
  ]
  return (
    <div
      role="group"
      aria-label="Сортировка"
      className={[
        'inline-flex rounded-lg border border-border p-0.5',
        disabled && 'opacity-50',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          disabled={disabled}
          aria-pressed={value === o.key}
          className={[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === o.key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
            disabled && 'cursor-not-allowed',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  )
}


function PhotoGrid({
  rows,
  sortable,
  sensors,
  onDragEnd,
  selectMode,
  selectedIds,
  onToggle,
  onOpen,
  onDelete,
}) {
  const ids = useMemo(() => rows.map((r) => r.id), [rows])
  const grid = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {rows.map((m, idx) => {
        const tileProps = {
          media: m,
          index: idx,
          selectMode,
          selected: selectedIds?.has(m.id) ?? false,
          onToggle: () => onToggle?.(m.id),
          onOpen: () => onOpen(idx),
          onDelete: () => onDelete(m),
        }
        return sortable ? (
          <SortablePhotoTile key={m.id} {...tileProps} />
        ) : (
          <PhotoTile key={m.id} {...tileProps} />
        )
      })}
    </div>
  )

  if (!sortable) return grid

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
    </DndContext>
  )
}

function SortablePhotoTile(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.media.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
    >
      <PhotoTile {...props} dragging={isDragging} />
    </div>
  )
}

function PhotoTile({ media, index, onOpen, onDelete, selectMode, selected, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const url =
    supabase.storage.from('client-photos').getPublicUrl(media.storage_path)?.data?.publicUrl ?? ''

  function handleDelete() {
    setMenuOpen(false)
    if (confirm(`Удалить фото «${media.filename}»?`)) onDelete()
  }

  function handleClick() {
    if (selectMode) onToggle?.()
    else onOpen()
  }

  return (
    <div
      className={[
        'group relative overflow-hidden rounded-lg ring-2 transition-all',
        selectMode && selected ? 'ring-primary' : 'ring-transparent',
      ].join(' ')}
      style={{ aspectRatio: '3 / 4' }}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={selectMode ? (selected ? `Снять выделение: ${media.filename}` : `Выбрать: ${media.filename}`) : `Открыть: ${media.filename}`}
        aria-pressed={selectMode ? selected : undefined}
        className="block h-full w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {url ? (
          <img
            src={url}
            alt={media.caption || media.filename}
            loading="lazy"
            className={[
              'h-full w-full object-cover transition-transform',
              !selectMode && 'group-hover:scale-[1.02]',
              selectMode && selected && 'opacity-90',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            no preview
          </div>
        )}
      </button>

      {/* Checkbox в select mode */}
      {selectMode && (
        <span
          className={[
            'pointer-events-none absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/80 bg-black/30 text-transparent',
          ].join(' ')}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {/* #N marker — скрыт в select mode */}
      {!selectMode && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          #{index + 1}
        </span>
      )}

      {/* Hover actions — скрыты в select mode (R2.6.3) */}
      {!selectMode && (
        <div
          className={[
            'absolute right-2 top-2 z-20 flex items-center gap-1 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
            className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
            title="Открыть"
            aria-label="Открыть"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen(true)
            }}
            className="rounded-md bg-black/60 p-1.5 text-white hover:bg-black/80"
            title="Ещё"
            aria-label="Ещё"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      )}

      {menuOpen && !selectMode && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="absolute right-2 top-10 z-40 min-w-[160px] rounded-lg bg-card py-1 shadow-xl ring-1 ring-border"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleDelete}
              className="block w-full px-3 py-1.5 text-left text-sm text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
            >
              Удалить
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyPhotos({ onUpload }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
        <ImageIcon size={22} />
      </div>
      <h3 className="text-base font-semibold text-foreground">Фото ещё нет</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Перетащите файлы сюда или нажмите кнопку.
      </p>
      <Button onClick={onUpload} className="mt-4">
        <Upload size={14} /> Загрузить первое фото
      </Button>
    </div>
  )
}

function GridSkeletonWithSlowHint() {
  // 8.B + 8.C: skeleton повторяет реальный grid + сообщение «Загружается …» через 2 сек.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 2000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      {slow && (
        <p className="mb-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          Загружается фото-галерея…
        </p>
      )}
      <GridSkeleton />
    </>
  )
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-busy="true"
      aria-label="Загрузка фото"
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg bg-muted"
          style={{ aspectRatio: '3 / 4' }}
        />
      ))}
    </div>
  )
}

function UploadBanner({ upload, onClose }) {
  const inProgress = !upload.done
  const hasErrors = upload.errors.length > 0
  const retrying = !!upload.retrying

  return (
    <div
      className={[
        'mb-4 flex items-start gap-3 rounded-lg border bg-card p-3',
        hasErrors
          ? 'border-[var(--warning-soft)]'
          : 'border-[var(--primary-soft)]',
      ].join(' ')}
      role={hasErrors ? 'alert' : 'status'}
      aria-live={hasErrors ? 'assertive' : 'polite'}
    >
      <div className={hasErrors ? 'mt-0.5 text-[var(--warning-ink)]' : 'mt-0.5 text-primary'}>
        {inProgress ? <Loader2 size={16} className="animate-spin" /> : hasErrors ? <AlertTriangle size={16} /> : <Check size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        {inProgress ? (
          <>
            <p className="text-sm font-medium text-foreground">
              {retrying
                ? `Повтор после сетевой ошибки · файл ${upload.currentIndex + 1} из ${upload.total}`
                : `Загружается файл ${upload.currentIndex + 1} из ${upload.total}`}
              {upload.current?.name && (
                <span className="ml-2 truncate font-mono text-xs text-muted-foreground" title={upload.current.name}>
                  · {upload.current.name}
                </span>
              )}
            </p>
            <ProgressBar bytes={upload.currentBytes} total={upload.currentTotal} />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground tabular">
              {formatFileSize(upload.currentBytes)} / {formatFileSize(upload.currentTotal)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              {hasErrors
                ? `Загружено ${upload.total - upload.errors.length} из ${upload.total} · ${upload.errors.length} с ошибкой`
                : `Загружено ${upload.total} · готово`}
            </p>
            {hasErrors && (
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--danger-ink)]">
                {upload.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.filename}</span>: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {!inProgress && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
          aria-label="Закрыть уведомление"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function ProgressBar({ bytes, total }) {
  const value = total > 0 ? Math.min(100, Math.max(0, (bytes / total) * 100)) : 0
  return (
    <div
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--primary-soft)]"
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
  )
}

// ============================================================================
// Helpers
// ============================================================================

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const result = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(result)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}


