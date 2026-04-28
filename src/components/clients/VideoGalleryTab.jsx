import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload,
  GripVertical,
  Calendar,
  Play,
  Film,
  Maximize2,
  MoreHorizontal,
  CheckSquare,
  Check,
  Loader2,
  AlertTriangle,
  X,
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
import { validateFile, FILE_LIMITS, formatFileSize, formatDuration } from '../../lib/clients.js'
import { uploadWithRetry } from '../../lib/upload.js'
import { ClientLightbox } from './ClientLightbox.jsx'
import { DropOverlay } from './DropOverlay.jsx'
import { BulkActionBar } from './BulkActionBar.jsx'

/**
 * Таб «Видео» — 16:9 grid + upload + lightbox-player + drag-reorder + bulk-select.
 * Большая часть структуры повторяет PhotoGalleryTab; различия — aspect-ratio,
 * bucket, MIME types, duration overlay на плитке, video preview.
 */
export function VideoGalleryTab({ callerId, client, onChanged }) {
  const [sort, setSort] = useState('manual')
  const { rows, loading, error, addMedia, updateMedia, deleteMedia, reorderMedia, reload } =
    useClientMedia(callerId, client.id, 'video', { sort })

  // 8.E: client-side search + duration filter
  const [search, setSearch] = useState('')
  const [durationFilter, setDurationFilter] = useState('all') // 'all' | 'lt1' | '1to5' | 'gt5'

  const [optimisticOrder, setOptimisticOrder] = useState(null)
  const orderedRows = useMemo(() => {
    if (!optimisticOrder) return rows
    const map = new Map(rows.map((r) => [r.id, r]))
    return optimisticOrder.map((id) => map.get(id)).filter(Boolean)
  }, [rows, optimisticOrder])

  // Apply search + duration filter (только для view, не серверный re-fetch)
  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orderedRows.filter((r) => {
      if (q) {
        const haystack = `${r.filename ?? ''} ${r.caption ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (durationFilter !== 'all') {
        const ms = r.duration_ms ?? null
        if (ms == null) return false
        const sec = ms / 1000
        if (durationFilter === 'lt1' && !(sec < 60)) return false
        if (durationFilter === '1to5' && !(sec >= 60 && sec <= 300)) return false
        if (durationFilter === 'gt5' && !(sec > 300)) return false
      }
      return true
    })
  }, [orderedRows, search, durationFilter])

  const isFilteredEmpty = displayRows.length === 0 && orderedRows.length > 0

  useEffect(() => {
    if (!optimisticOrder) return
    const same =
      rows.length === optimisticOrder.length && rows.every((r, i) => r.id === optimisticOrder[i])
    if (same) setOptimisticOrder(null)
  }, [rows, optimisticOrder])

  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [dragReject, setDragReject] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [upload, setUpload] = useState(null)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)
  const dragDepth = useRef(0)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const allIds = useMemo(() => displayRows.map((r) => r.id), [displayRows])
  const allSelected = selectedIds.size > 0 && selectedIds.size === allIds.length
  const [bulkBusy, setBulkBusy] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // ---- DnD handlers ----
  // Reorder работает только над «полным» orderedRows (без search/filter),
  // иначе reorderMedia получит неполный список ids и удалит позицию у скрытых.
  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedRows.findIndex((r) => r.id === active.id)
    const newIndex = orderedRows.findIndex((r) => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const newOrder = arrayMove(orderedRows, oldIndex, newIndex).map((r) => r.id)
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

  // ---- Selection ----
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
  const selectAll = () => setSelectedIds(new Set(allIds))
  const clearAll = () => setSelectedIds(new Set())

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Удалить ${selectedIds.size} видео? Это действие необратимо.`)) return
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
    const idSet = selectedIds
    const targets = displayRows.filter((m) => idSet.has(m.id))
    targets.forEach((m, i) => {
      const url = supabase.storage.from('client-videos').getPublicUrl(m.storage_path)?.data?.publicUrl
      if (!url) return
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

  // ---- Drop overlay ----
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
    function onDragEnter(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      const items = e.dataTransfer.items
      const count = items?.length || 0
      setPendingCount(count)
      const firstItem = items?.[0]
      if (firstItem && !FILE_LIMITS.video.mimeTypes.includes(firstItem.type)) {
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
      handleFiles(Array.from(e.dataTransfer.files))
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
        const v = validateFile(f, 'video')
        if (!v.valid) {
          errors.push({ filename: f.name, error: v.error })
          continue
        }
        try {
          const ext = f.name.split('.').pop()?.toLowerCase() || 'mp4'
          const path = `${client.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          await uploadWithRetry(
            'client-videos',
            path,
            f,
            (loaded, total) => {
              setUpload((u) => (u ? { ...u, currentBytes: loaded, currentTotal: total } : u))
            },
            () => setUpload((u) => (u ? { ...u, retrying: true } : u)),
          )

          const meta = await readVideoMetadata(f).catch(() => ({
            width: null,
            height: null,
            durationMs: null,
          }))
          await addMedia({
            storagePath: path,
            filename: f.name,
            sizeBytes: f.size,
            mimeType: f.type,
            width: meta.width,
            height: meta.height,
            durationMs: meta.durationMs,
          })
        } catch (err) {
          errors.push({ filename: f.name, error: err.message })
        }
      }

      setUpload({ current: null, currentIndex: queue.length, total: queue.length, errors, done: true })
      onChanged?.()
      if (errors.length === 0) setTimeout(() => setUpload(null), 2000)
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
        accept={FILE_LIMITS.video.mimeTypes.join(',')}
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      <section className="surface-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SortToggle value={sort} onChange={setSort} disabled={selectMode || search.trim() !== '' || durationFilter !== 'all'} />
            {orderedRows.length > 0 && (
              <DurationFilter value={durationFilter} onChange={setDurationFilter} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={toggleSelectMode}
              aria-pressed={selectMode}
              className={selectMode ? 'bg-foreground text-background hover:opacity-90' : undefined}
            >
              {selectMode ? <Check size={14} /> : <CheckSquare size={14} />}
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
          {orderedRows.length > 0 && (
            <div className="mb-3">
              <VideoSearch value={search} onChange={setSearch} />
            </div>
          )}

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
            До 500 МБ · форматы: MP4, WEBM, MOV (H.264) · превью генерируются автоматически
          </p>

          {upload && <UploadBanner upload={upload} onClose={() => setUpload(null)} />}

          {loading && rows.length === 0 ? (
            <GridSkeletonWithSlowHint />
          ) : error ? (
            <p className="text-sm text-[var(--danger-ink)]" role="alert">Ошибка: {error}</p>
          ) : orderedRows.length === 0 ? (
            <EmptyVideos onUpload={onPickClick} />
          ) : isFilteredEmpty ? (
            <EmptyVideoFilter
              onClearSearch={() => setSearch('')}
              onClearAll={() => {
                setSearch('')
                setDurationFilter('all')
              }}
              hasSearch={search.trim() !== ''}
              hasDurationFilter={durationFilter !== 'all'}
            />
          ) : (
            <VideoGrid
              rows={displayRows}
              sortable={sort === 'manual' && !selectMode && search.trim() === '' && durationFilter === 'all'}
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
          type="video"
          reject={dragReject !== null}
          rejectMessage={
            dragReject === 'mime' ? 'Поддерживаются MP4 · WEBM · MOV (H.264)' : null
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

function VideoSearch({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <svg
        className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--fg4)]"
        viewBox="0 0 16 16"
        aria-hidden
      >
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по имени файла или подписи…"
        aria-label="Поиск видео"
        className="rounded-lg border border-border bg-card pl-8 pr-2 py-1.5 text-xs text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary w-64"
      />
    </label>
  )
}

function DurationFilter({ value, onChange }) {
  const opts = [
    { key: 'all', label: 'Все' },
    { key: 'lt1', label: '< 1 мин' },
    { key: '1to5', label: '1–5 мин' },
    { key: 'gt5', label: '> 5 мин' },
  ]
  return (
    <div
      role="group"
      aria-label="Фильтр по длительности"
      className="inline-flex items-center rounded-lg border border-border p-0.5"
    >
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={[
            'inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === o.key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function EmptyVideoFilter({ hasSearch, hasDurationFilter, onClearSearch, onClearAll }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-foreground">Под фильтр ничего не подходит</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Попробуйте сбросить часть критериев.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {hasSearch && (
          <Button onClick={onClearSearch}>
            Очистить поиск
          </Button>
        )}
        {(hasSearch || hasDurationFilter) && (
          <Button variant="ghost" onClick={onClearAll}>
            Сбросить фильтры
          </Button>
        )}
      </div>
    </div>
  )
}

function SortToggle({ value, onChange, disabled }) {
  const opts = [
    { key: 'manual', label: 'Вручную', icon: <GripVertical size={12} /> },
    { key: 'date_desc', label: 'По дате', icon: <Calendar size={12} /> },
  ]
  return (
    <div
      role="group"
      aria-label="Сортировка"
      title={disabled ? 'Сортировка недоступна при активном поиске или фильтре' : undefined}
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

function VideoGrid({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <SortableVideoTile key={m.id} {...tileProps} />
        ) : (
          <VideoTile key={m.id} {...tileProps} />
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

function SortableVideoTile(props) {
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
      <VideoTile {...props} dragging={isDragging} />
    </div>
  )
}

function VideoTile({ media, index, onOpen, onDelete, selectMode, selected, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const url =
    supabase.storage.from('client-videos').getPublicUrl(media.storage_path)?.data?.publicUrl ?? ''

  function handleDelete() {
    setMenuOpen(false)
    if (confirm(`Удалить видео «${media.filename}»?`)) onDelete()
  }
  function handleClick() {
    if (selectMode) onToggle?.()
    else onOpen()
  }

  const isProcessing = media.status === 'processing'
  const isError = media.status === 'error'

  return (
    <div
      className={[
        'group relative overflow-hidden rounded-lg ring-2 transition-all',
        selectMode && selected ? 'ring-primary' : 'ring-transparent',
      ].join(' ')}
      style={{ aspectRatio: '16 / 9' }}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={selectMode ? (selected ? `Снять выделение: ${media.filename}` : `Выбрать: ${media.filename}`) : `Открыть: ${media.filename}`}
        aria-pressed={selectMode ? selected : undefined}
        className="block h-full w-full overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {isProcessing ? (
          <ProcessingPreview filename={media.filename} />
        ) : isError ? (
          <ErrorPreview filename={media.filename} reason={media.error_reason} />
        ) : url ? (
          <video
            src={url}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            // first frame as poster (browser default)
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--fg4)]">
            no preview
          </div>
        )}

        {/* Play icon overlay (только для готовых видео) */}
        {!isProcessing && !isError && url && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
              <Play size={20} />
            </div>
          </div>
        )}
      </button>

      {/* Duration chip — bottom-right */}
      {media.duration_ms != null && !isProcessing && !isError && (
        <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {formatDuration(media.duration_ms)}
        </span>
      )}

      {/* Selection checkbox */}
      {selectMode && (
        <span
          className={[
            'pointer-events-none absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border-2',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/80 bg-black/30 text-transparent',
          ].join(' ')}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M2 6.5l2.5 2.5 5-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}

      {/* #N marker */}
      {!selectMode && !isProcessing && !isError && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          #{index + 1}
        </span>
      )}

      {/* Hover actions */}
      {!selectMode && !isProcessing && (
        <div
          className={[
            'absolute right-2 top-2 z-20 flex items-center gap-1 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          ].join(' ')}
        >
          {!isError && (
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
          )}
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
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden />
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

function ProcessingPreview({ filename }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-xs text-muted-foreground">
      <Loader2 size={16} className="animate-spin" />
      <span className="font-medium">Обрабатывается…</span>
      <span className="font-mono text-[10px] opacity-70">{filename}</span>
    </div>
  )
}

function ErrorPreview({ filename, reason }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--danger-soft)] text-xs text-[var(--danger-ink)]"
      role="alert"
    >
      <AlertTriangle size={16} />
      <span className="font-medium">Не удалось загрузить</span>
      <span className="font-mono text-[10px] opacity-80 truncate max-w-full px-2" title={filename}>{filename}</span>
      {reason && <span className="px-3 text-center text-[10px] opacity-80">{reason}</span>}
    </div>
  )
}

function EmptyVideos({ onUpload }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
        <Film size={22} />
      </div>
      <h3 className="text-base font-semibold text-foreground">Видео ещё нет</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Перетащите файлы сюда или нажмите кнопку.
      </p>
      <Button onClick={onUpload} className="mt-4">
        <Upload size={14} /> Загрузить первое видео
      </Button>
    </div>
  )
}

function GridSkeletonWithSlowHint() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 2000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      {slow && (
        <p className="mb-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          Загружается видео-галерея…
        </p>
      )}
      <GridSkeleton />
    </>
  )
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="Загрузка видео"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg bg-muted"
          style={{ aspectRatio: '16 / 9' }}
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
        hasErrors ? 'border-[var(--warning-soft)]' : 'border-[var(--primary-soft)]',
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

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const result = {
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      }
      URL.revokeObjectURL(url)
      resolve(result)
    }
    video.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    video.src = url
  })
}

