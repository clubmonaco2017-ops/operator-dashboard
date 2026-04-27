# Subplan 6D2 — `ClientLightbox` migration to Base UI Dialog primitive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `src/components/clients/ClientLightbox.jsx` from a hand-rolled `<div className="fixed inset-0 z-[70] bg-black/90">` overlay to Base UI's `Dialog` primitive used directly (without shadcn `<Dialog>` wrapper).

**Architecture:** Replace the wrapper `<div>` + manual Esc/focus/scroll-lock plumbing with `<DialogPrimitive.Root>` + `<Portal>` + `<Backdrop>` + `<Popup>`. Keep all domain UI (toolbar, navigation, caption edit-mode, swipe handlers) byte-identical. Esc-in-caption-edit semantics handled via `onOpenChange` guard. `autoFocus` attribute on close-X button replaces the deleted focus-management `useEffect`.

**Tech Stack:** React 19, Vite, Tailwind v4, `@base-ui/react/dialog` (primitive used directly — same import that `src/components/ui/dialog.jsx` is built on), vitest, ESLint v9.

**Spec:** [docs/superpowers/specs/2026-04-27-crm-subplan-6d2-lightbox-migration-design.md](../specs/2026-04-27-crm-subplan-6d2-lightbox-migration-design.md)

---

## File structure

**Modified — 1 file:**
- `src/components/clients/ClientLightbox.jsx` (entire file replacement)

**Untouched (consumers):**
- `src/components/clients/PhotoGalleryTab.jsx` — renders `<ClientLightbox ... />` conditionally
- `src/components/clients/VideoGalleryTab.jsx` — same
- `src/components/tasks/TaskReportCard.jsx` — same

Prop signature is unchanged (`{ items, initialIndex, onClose, onDelete, onUpdateCaption }`); consumers do not need updates.

**Tests:** none added (per spec §2 — preserve baseline; no `ClientLightbox.test.jsx` exists today).

---

## Setup

### Task 0: Verify baseline

**Files:** none (read-only).

- [ ] **Step 0.1: Verify clean working tree on `main`**

```bash
git status
git log --oneline -3
```
Expected: working tree clean; `HEAD` is at the latest commit on `main` (or branch ahead with the spec commit `afbd4d6` only). If anything else is staged or modified, stop and ask the user.

- [ ] **Step 0.2: Create feature branch from `main`**

```bash
git checkout -b feat/6d2-lightbox-migration
```

- [ ] **Step 0.3: Verify lint baseline**

```bash
npm run lint 2>&1 | tail -3
```
Expected: `✖ 52 problems (51 errors, 1 warning)` — pre-existing baseline. The plan does NOT fix these.

- [ ] **Step 0.4: Verify scoped lint baseline for `ClientLightbox.jsx`**

```bash
npm run lint 2>&1 | grep "ClientLightbox"
```
Expected: empty output. The file has 0 baseline lint errors. Migration must keep this at 0.

- [ ] **Step 0.5: Verify tests pass on baseline**

```bash
npm run test:run 2>&1 | tail -5
```
Expected: `Tests 235 passed (235)`.

- [ ] **Step 0.6: Verify project-wide acceptance grep is currently empty (matches 6D acceptance gate)**

```bash
grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"
```
Expected: empty. After 6D2 this remains empty (Lightbox stays in exclusion list as legitimate primitive consumer per spec §7 R6).

---

## Migration

### Task 1: Migrate `ClientLightbox.jsx`

**Files:**
- Modify: `src/components/clients/ClientLightbox.jsx` (entire file replacement)

**What changes (per spec §3-§6 summarized):**

1. Outer `<div className="fixed inset-0 z-[70] bg-black/90 text-white" role="dialog" aria-modal aria-label={...} onClick={...}>` → `<DialogPrimitive.Root open onOpenChange={guard}><DialogPrimitive.Portal><DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/90" /><DialogPrimitive.Popup className="fixed inset-0 z-[70] flex flex-col text-white outline-none" aria-label={...} onTouchStart={...} onTouchEnd={...}>...</DialogPrimitive.Popup></DialogPrimitive.Portal></DialogPrimitive.Root>`.
2. `onOpenChange` guard: if `next` is `false`, route to `cancelCaptionEdit()` when `captionEditing` is true, else `onClose()`.
3. Delete focus-management `useEffect` (lines 81-91) — `closeBtnRef`, `previouslyFocused`, `dialogRef` `useRef` declarations also deleted.
4. Delete body-scroll-lock `useEffect` (lines 94-100).
5. Trim hotkey `useEffect` (lines 54-78) — keep only `←`/`→` arrow keys; Esc handling moves to `onOpenChange` guard. Add early return on `captionEditing`.
6. Add `autoFocus` attribute to close-X button — replaces deleted `closeBtnRef.current?.focus()`.
7. Add `e.preventDefault()` in `onTouchEnd` swipe-detected branch (suppresses synthesized click after swipe).
8. Drop `useRef` from `useState`/`useEffect`-style React imports — no longer needed (`captionRef` stays via `useRef`, but `closeBtnRef`/`previouslyFocused`/`dialogRef` are gone, so `useRef` import remains only for `captionRef`).
9. Drop manual `role="dialog"`/`aria-modal`/`aria-label` from old wrapper; `aria-label` re-added on `Popup`.

- [ ] **Step 1.1: Read current source to verify baseline shape**

```bash
cat src/components/clients/ClientLightbox.jsx
```

Confirm the file has:
- 5 `useEffect` blocks (hotkeys, focus management, body scroll lock, caption draft reset, caption textarea focus)
- 4 `useRef` declarations (`captionRef`, `closeBtnRef`, `previouslyFocused`, `dialogRef`)
- Outer wrapper `<div className="fixed inset-0 z-[70] bg-black/90 text-white" role="dialog" aria-modal aria-label={...} onClick={...} onTouchStart={...} onTouchEnd={...}>`
- 432 LOC

If shape differs significantly from this, stop and report — the plan was written against a specific source state.

- [ ] **Step 1.2: Replace the entire file contents with the migrated source**

Replace `src/components/clients/ClientLightbox.jsx` with the following:

```jsx
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
  useEffect(() => {
    if (captionEditing) return // arrows do not paginate while editing caption (textarea uses arrows for caret)
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, captionEditing])

  // Touch swipe-down to close (mobile gesture). Skipped while editing caption so swipes inside textarea don't close.
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
      e.preventDefault() // suppress synthesized click on touch devices
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
```

Key changes from original (delta):

| Before | After |
|---|---|
| 5 `useEffect` blocks | 3 `useEffect` blocks (focus mgmt + body scroll lock removed; hotkey trimmed) |
| 4 `useRef` declarations | 1 `useRef` (`captionRef` only; `closeBtnRef`, `previouslyFocused`, `dialogRef` removed; `touchStartY`/`touchStartX` are still `useRef` — those stay) |
| Outer `<div role="dialog" aria-modal aria-label onClick={...}>` | `<DialogPrimitive.Root open onOpenChange={...}><Portal><Backdrop/><Popup aria-label onTouchStart onTouchEnd>...</Popup></Portal></DialogPrimitive.Root>` |
| Esc handled in keydown listener with caption-edit branching | Esc handled by Base UI → routed via `onOpenChange` guard |
| `closeBtnRef.current?.focus()` initial focus | `autoFocus` attribute on close-X button |
| `document.body.style.overflow = 'hidden'` manual lock | Base UI auto-locks body scroll while open |
| No `e.preventDefault()` in swipe-detected branch | `e.preventDefault()` added (suppresses synthesized click on touch devices) |

Note on `touchStartY`/`touchStartX`: these are `useRef` declarations inside the function body for swipe handling. They are domain refs, not overlay management — preserved.

- [ ] **Step 1.3: Verify removal of legacy patterns**

```bash
grep -nE 'role="dialog"|aria-modal=|closeBtnRef|previouslyFocused|dialogRef|document\.body\.style\.overflow' src/components/clients/ClientLightbox.jsx
```
Expected: empty output.

```bash
grep -nE "e\.key === 'Escape'|e\.key === \"Escape\"" src/components/clients/ClientLightbox.jsx
```
Expected: empty (Esc no longer in keydown listener; handled via Base UI).

- [ ] **Step 1.4: Verify Base UI primitive is used directly (not shadcn wrapper)**

```bash
grep -n 'DialogPrimitive\|@base-ui/react/dialog' src/components/clients/ClientLightbox.jsx
```
Expected: import line + 4 usages: `<DialogPrimitive.Root>`, `<DialogPrimitive.Portal>`, `<DialogPrimitive.Backdrop>`, `<DialogPrimitive.Popup>`.

```bash
grep -n "from '@/components/ui/dialog'" src/components/clients/ClientLightbox.jsx
```
Expected: empty (file does NOT import shadcn dialog wrapper).

- [ ] **Step 1.5: Verify `autoFocus` is on close-X button**

```bash
grep -n 'autoFocus' src/components/clients/ClientLightbox.jsx
```
Expected: 1 match, on the close-X button (the one with `aria-label="Закрыть просмотр"`).

- [ ] **Step 1.6: Verify swipe-detected `e.preventDefault()` is present**

```bash
grep -B1 -A2 "dy > 80" src/components/clients/ClientLightbox.jsx
```
Expected: shows `e.preventDefault()` immediately inside the swipe-detected `if (dy > 80 && ...)` block.

- [ ] **Step 1.7: Verify `onOpenChange` guard handles caption-edit**

```bash
grep -B1 -A6 'onOpenChange' src/components/clients/ClientLightbox.jsx
```
Expected: shows the guard logic — `if (next) return; if (captionEditing) { cancelCaptionEdit() } else { onClose() }`.

- [ ] **Step 1.8: Run scoped lint**

```bash
npm run lint 2>&1 | grep "ClientLightbox"
```
Expected: empty output. No new errors introduced.

- [ ] **Step 1.9: Run full test suite**

```bash
npm run test:run 2>&1 | tail -5
```
Expected: `Tests 235 passed (235)`. No tests directly cover `ClientLightbox`; this verifies no consumer broke.

- [ ] **Step 1.10: Verify project-wide acceptance grep still empty**

```bash
grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"
```
Expected: empty output. Same as 6D acceptance gate. `ClientLightbox` stays in exclusion list as legitimate Base UI primitive consumer (Backdrop and Popup both use `fixed inset-0` to cover viewport — canonical pattern).

- [ ] **Step 1.11: Manual preview verification**

Run the dev server and open the app in a browser. Verify:

```bash
# In the dev terminal:
npm run dev
```

Then in the app:
1. **Open Lightbox from Photos:** in `/clients/:id` → Photos tab, click any photo. Lightbox opens. Image renders. Counter shows `1 / N`.
2. **Arrow navigation:** press `→` — moves to next image. Press `←` — moves back. Reaching first/last item — chevron buttons get `disabled` styling (opacity 30%).
3. **Esc closes (normal mode):** press `Esc` while not editing — Lightbox closes, focus returns to the photo grid item that was clicked.
4. **Backdrop click closes:** click on the black margin around the image — Lightbox closes.
5. **Close X closes:** click the X button in top-right toolbar — Lightbox closes.
6. **Tab cycling:** press `Tab` repeatedly inside Lightbox — focus cycles through toolbar buttons (pencil/download/more/close), counter, chevrons, video controls (if video). Tab does not escape outside the Popup.
7. **Caption edit:** click the pencil icon → textarea appears, focused, with cursor at end of existing caption.
8. **Cmd/Ctrl+Enter saves:** type a new caption, press `Cmd+Enter` (Mac) or `Ctrl+Enter` (Linux/Windows) — caption saves, edit-mode exits.
9. **Esc cancels caption edit (overlay stays open):** click pencil → textarea appears → press `Esc` — textarea closes, Lightbox stays open showing original caption.
10. **Backdrop click in caption-edit:** click pencil → textarea appears → click on backdrop (black margin) — textarea closes (caption-edit cancelled), Lightbox stays open.
11. **Close X in caption-edit:** click pencil → textarea appears → click X — Lightbox closes (unsaved draft lost — by design).
12. **Long-caption expand/collapse:** find an item with caption > 140 chars (or temporarily save one). "Подробнее" toggle works.
13. **Open Lightbox from Videos:** in `/clients/:id` → Videos tab, click any video. Video renders with native controls. Press play — works. Tab into video controls — focus reaches play/timeline/volume.
14. **Open Lightbox from Tasks:** in any `/tasks/:id` with media report attached, click an attachment. Same Lightbox renders.
15. **Touch swipe-down (if testing on mobile / DevTools touch emulation):** start touch on backdrop area, swipe down >80px, release — Lightbox closes.
16. **More menu → Удалить:** click "more" (kebab) → "Удалить" → native browser confirm appears. Cancel → confirm dismisses, item stays. Confirm OK → item deletes. If was only item, Lightbox auto-closes.

If any of these fails, fix before committing.

- [ ] **Step 1.12: Commit**

```bash
git add src/components/clients/ClientLightbox.jsx
git commit -m "$(cat <<'EOF'
feat(clients): Subplan 6D2 — ClientLightbox migrates to Base UI Dialog primitive

Closes the 6D track: replaces hand-rolled fixed-inset overlay with
DialogPrimitive.Root + Portal + Backdrop + Popup used directly
(not via shadcn wrapper, since visual is fully custom full-screen
viewer). Esc handled by primitive; Esc-in-caption-edit intercepted
via onOpenChange guard to cancel edit instead of closing overlay.
Initial focus on close-X via autoFocus; focus trap and body scroll
lock now handled by Base UI. Touch swipe-down preserved with
e.preventDefault() to suppress synthesized click. All domain UI
(toolbar, counter, prev/next, caption edit-mode, hint) preserved
verbatim. Three consumers (PhotoGalleryTab, VideoGalleryTab,
TaskReportCard) untouched — prop signature unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## PR

### Task 2: Open Wave 6D2 PR

- [ ] **Step 2.1: Switch to clubmonaco2017-ops user (per memory) and push branch**

```bash
gh auth switch --user clubmonaco2017-ops
git push -u origin HEAD
```

- [ ] **Step 2.2: Create PR**

```bash
gh pr create --title "feat(clients): Subplan 6D2 — ClientLightbox migrates to Base UI Dialog primitive (closes 6D)" --body "$(cat <<'EOF'
## Summary

Final closure of the [6D track](docs/superpowers/specs/2026-04-27-crm-subplan-6d-modals-migration-design.md) — migrate the deferred Lightbox from hand-rolled overlay to Base UI \`Dialog\` primitive (used directly, not via shadcn wrapper).

[Spec](docs/superpowers/specs/2026-04-27-crm-subplan-6d2-lightbox-migration-design.md). Single file migration: \`src/components/clients/ClientLightbox.jsx\`.

## What changed

**Overlay container migrated:**
- \`<div className="fixed inset-0 z-[70] bg-black/90" role="dialog" aria-modal aria-label onClick>\` → \`<DialogPrimitive.Root open onOpenChange><Portal><Backdrop /><Popup aria-label onTouchStart onTouchEnd>...</Popup></Portal></DialogPrimitive.Root>\`
- 2 \`useEffect\` blocks deleted (focus management, body scroll lock — Base UI handles both)
- 1 \`useEffect\` block trimmed (hotkeys: only \`←\`/\`→\` remain; Esc moved to \`onOpenChange\` guard)
- 3 \`useRef\` declarations deleted (\`closeBtnRef\`, \`previouslyFocused\`, \`dialogRef\`)
- \`autoFocus\` on close-X button replaces deleted manual focus
- \`e.preventDefault()\` added in touch-swipe-detected branch (suppresses synthesized click)

**\`onOpenChange\` guard handles Esc-in-caption-edit:**
\`\`\`jsx
onOpenChange={(next) => {
  if (next) return
  if (captionEditing) {
    cancelCaptionEdit()
  } else {
    onClose()
  }
}}
\`\`\`
Esc / backdrop click while editing caption cancels the edit (overlay stays). Direct close-X click and swipe-down bypass the guard (explicit user signals).

**Domain UI preserved verbatim:**
- Toolbar (edit caption / download / more menu / close)
- Top-left counter
- Side prev/next chevrons
- Image / video viewer
- Caption edit-mode (textarea + Cmd/Ctrl+Enter save / Esc cancel)
- Long-caption expand/collapse
- Touch swipe-down handlers
- Bottom keyboard hint
- Three consumers (\`PhotoGalleryTab\`, \`VideoGalleryTab\`, \`TaskReportCard\`) — prop signature unchanged, no consumer edits

## Out of scope (explicit, deferred)

- Hand-rolled \`<div role="menu">\` "more" dropdown — candidate for shadcn \`<DropdownMenu>\` mini-subplan together with gallery menu scrims
- Native browser \`confirm("Удалить ...?")\` in \`handleDelete\` — separate task
- DS-token swap inside body — out of scope per spec §2

## Acceptance gate (matches 6D's)

\`\`\`bash
$ grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\\.jsx|components/ui\\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"
# (empty — \`ClientLightbox\` stays in exclusion list as legitimate primitive consumer)
\`\`\`

## Test plan

- [x] \`npm run lint\` — no new errors in ClientLightbox.jsx (51 baseline preserved)
- [x] \`npm run test:run\` — 235/235 (no test directly covers ClientLightbox; verified no consumer broke)
- [ ] Preview: open Lightbox from Photos → \`←\`/\`→\` nav, Esc closes, backdrop closes, X closes
- [ ] Preview: open from Videos → video controls Tab-reachable
- [ ] Preview: caption edit → \`Cmd+Enter\` saves, Esc cancels (overlay stays), backdrop click cancels edit (overlay stays)
- [ ] Preview: open from Tasks attachment
- [ ] Preview (touch / DevTools touch emulation): swipe-down >80px closes; swipe-down inside textarea (caption-edit) does not close
- [ ] Preview: more menu → Удалить → native confirm → delete + auto-close if last item

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2.3: Switch back to temashdesign**

```bash
gh auth switch --user temashdesign
```

- [ ] **Step 2.4: Wait for PR review and merge**

After review and approval, merge per memory `project_gh_auth.md`:

```bash
gh auth switch --user clubmonaco2017-ops
gh pr merge --squash --delete-branch
gh auth switch --user temashdesign
git checkout main
git fetch origin
git reset --hard origin/main
git branch -D feat/6d2-lightbox-migration
```

---

## Acceptance summary

After Task 2 merges:
- `src/components/clients/ClientLightbox.jsx` uses Base UI `Dialog` primitive directly
- 2 deleted `useEffect` + 1 trimmed `useEffect` + 3 deleted `useRef` declarations
- `autoFocus` on close-X
- `onOpenChange` guard for caption-edit
- Project-wide acceptance grep returns empty (matches 6D)
- 235/235 tests pass; 51 baseline lint errors unchanged
- Three consumers untouched
- 6D track fully closed (Wave 1 + Wave 2 + Wave 3 + 6D2)
