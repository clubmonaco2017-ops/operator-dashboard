# Subplan 6D2 — `ClientLightbox` → Base UI Dialog primitive migration

**Status:** Design — pending implementation plan
**Date:** 2026-04-27
**Continuation of:** Subplan 6D (overlay → shadcn Dialog/Sheet migration). 6D2 closes the deferred Lightbox track.

## 1. Problem

`src/components/clients/ClientLightbox.jsx` is the last in-scope hand-rolled overlay in the codebase. 6D explicitly deferred it because its shape is fundamentally different from confirm dialogs / modals / slide-outs:

- Full-screen viewer (not a centered card or right-side sheet)
- Custom toolbar (edit caption / download / "more" menu / close)
- Arrow-key navigation (`←`/`→`) between items
- Caption edit-mode with its own Esc semantics (Esc cancels edit, doesn't close overlay)
- Touch swipe-down gesture to close
- Long-caption expand/collapse, item counter, prev/next chevrons

Currently the file uses `<div className="fixed inset-0 z-[70] bg-black/90">` with manual:
- Esc/arrow-key keydown listener
- Focus management (`closeBtnRef`, `previouslyFocused` refs)
- Body scroll lock (`document.body.style.overflow = 'hidden'`)
- ARIA attributes (`role="dialog"`, `aria-modal`, `aria-label`)
- Backdrop click handling (`onClick` with `target === currentTarget` check)

After 6D, this is the only remaining hand-rolled overlay outside the explicit allowlist (`components/ui/`, `AdminLayout`, legacy `components/ui.jsx`, gallery menu scrims).

## 2. Goal & scope

Migrate the **overlay container only** to Base UI's `Dialog` primitive, replacing the hand-rolled wrapper while keeping all domain UI (toolbar, navigation, caption edit, swipe handlers, etc.) intact.

**In scope:**
- `src/components/clients/ClientLightbox.jsx` — entire file, structural overlay migration

**Out of scope (preserved as-is, with rationale):**

| Item | Reason | Future track |
|---|---|---|
| Hand-rolled `<div role="menu">` for "more"/Delete dropdown (lines ~247-271) | Domain UI pattern, not overlay; needs `<DropdownMenu>` migration | Mini-subplan together with `Photo/VideoGalleryTab` menu scrims (already flagged in roadmap) |
| Native browser `confirm("Удалить ...?")` in `handleDelete` (line 165) | Sync browser API; replacing with `<Dialog>`-confirm requires rewriting `handleDelete` to async + state | Separate task, low priority |
| Caption edit-mode UI (textarea, save/cancel buttons, Cmd+Enter handler) | Domain UX | Stays |
| Counter, prev/next chevrons, toolbar layout, hint, swipe-down handlers | Domain UI | Stays |
| Long-caption expand/collapse | Domain UX | Stays |
| Test coverage | No `ClientLightbox.test.jsx` exists today; preserve baseline | Add later if needed |

## 3. Architecture

### 3.1 Primitive choice — Base UI directly, not shadcn `<Dialog>`

shadcn `<DialogContent>` (at `src/components/ui/dialog.jsx`) has hardcoded defaults — `top-1/2 left-1/2 max-w-sm rounded-xl bg-popover p-4 ring-1`, plus a built-in close button via `showCloseButton={true}`. For a full-screen black-background viewer with its own custom toolbar, every one of these defaults must be overridden, producing a long `!important`-laden className chain. Cleaner to compose with Base UI directly.

Base UI's `Dialog` is what `dialog.jsx` is built on; using it directly skips the unwanted shadcn defaults while keeping the same primitive guarantees:
- Focus trap within `Dialog.Popup`
- Esc key → `onOpenChange(false)`
- Backdrop click → `onOpenChange(false)`
- Body scroll lock while open
- Portal mounting (rendered on `document.body`)
- ARIA roles and attributes set automatically (`role="dialog"`, `aria-modal="true"`)

```jsx
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
```

### 3.2 Control model

Parents (`PhotoGalleryTab`, `VideoGalleryTab`, `TaskReportCard`) keep their existing conditional-mount pattern unchanged:

```jsx
{lightboxOpen && (
  <ClientLightbox
    items={...}
    initialIndex={...}
    onClose={() => setLightboxOpen(false)}
    onDelete={...}
    onUpdateCaption={...}
  />
)}
```

Inside `ClientLightbox`, `open` is hard-coded to `true` (component is only mounted when open). `onOpenChange(false)` triggers an inline guard:

```jsx
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
```

The guard centralizes Esc + backdrop-click handling. While caption editing is active, both Esc and outside-click cancel the edit instead of closing the overlay (matching existing UX). The close-X button and the touch-swipe-down gesture both bypass the guard (call `onClose()` directly), since they're explicit user signals to close.

### 3.3 DOM shape

```jsx
<DialogPrimitive.Root open onOpenChange={...}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/90" />
    <DialogPrimitive.Popup
      className="fixed inset-0 z-[70] flex flex-col text-white outline-none"
      aria-label={`Просмотр: ${titleText}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* All existing content unchanged: toolbar, counter, prev/next, media, caption, hint */}
    </DialogPrimitive.Popup>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
```

Notes on className choices:

- `z-[70]` preserved on both Backdrop and Popup — Lightbox stacks above standard modals (`z-50`) and confirm dialogs (`z-50` portals). The `[70]` is intentional: gallery tabs may have a kebab menu at `z-30` open, modals open simultaneously is not a legitimate concurrent state, but `[70]` documents Lightbox-as-foremost intent.
- `bg-black/90` only on Backdrop (in old code it was on the wrapper that combined backdrop+content).
- `text-white` moved to Popup so all child elements inherit the light text color (was on the old wrapper).
- `outline-none` on Popup — Base UI sets `tabIndex={-1}` on Popup and may briefly focus it; without `outline-none` a focus ring would appear around the entire viewport. All interactive children inside have explicit `focus-visible:outline-2 focus-visible:outline-white/60` rules, so this doesn't suppress per-element focus indicators.

### 3.4 ARIA changes

- Manual `role="dialog"` / `aria-modal="true"` on the wrapper `<div>` → removed; Base UI sets these on `Popup`.
- `aria-label` migrates from wrapper to `Popup` (preserves screen-reader announcement).
- All inner-element ARIA (`aria-label` on icon buttons, `aria-haspopup` on more-menu trigger, `aria-expanded` on long-caption toggle, etc.) — preserved verbatim.

## 4. `useEffect` cleanup

The current implementation has 5 `useEffect` blocks. Migration changes:

| # | Block | Action | Lines (current) |
|---|---|---|---|
| 1 | Hotkey listener (Esc + arrow keys + Esc-in-caption-edit cancel) | **Trim:** keep only `←`/`→` arrow keys; Esc handling moves to `onOpenChange` guard | 54-78 |
| 2 | Focus management (`previouslyFocused` save + `closeBtnRef.current?.focus()` initial + restore on unmount) | **Delete entirely:** Base UI handles focus trap and restoration; initial focus on close-button via `autoFocus` attribute | 81-91 |
| 3 | Body scroll lock (`document.body.style.overflow = 'hidden'`) | **Delete entirely:** Base UI locks body scroll while dialog is open | 94-100 |
| 4 | Caption draft reset on item change | **Keep:** domain logic | 132-135 |
| 5 | Caption textarea focus + cursor on enter edit-mode | **Keep:** domain UX | 138-144 |

### 4.1 Trimmed hotkey effect (post-migration)

```jsx
useEffect(() => {
  if (captionEditing) return // arrows do not paginate while editing
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
```

Early return when `captionEditing` is true ensures arrow keys do not paginate while user types in textarea (textarea handles arrows natively for caret movement).

### 4.2 Initial-focus migration

The deleted focus-management `useEffect` previously did:

```jsx
useEffect(() => {
  previouslyFocused.current = document.activeElement
  closeBtnRef.current?.focus()
  return () => { previouslyFocused.current?.focus?.() }
}, [])
```

Replaced by:
- Removing `closeBtnRef`, `previouslyFocused`, and `dialogRef` `useRef` declarations.
- Adding `autoFocus` attribute to the close-X button:

```jsx
<button
  type="button"
  onClick={onClose}
  autoFocus
  className="..."
  aria-label="Закрыть просмотр"
>
  <X size={18} />
</button>
```

Base UI restores focus to the previously-focused element automatically on unmount (per-popup focus restoration).

## 5. Hotkey / swipe / close orchestration

| Action | Source | Routing |
|---|---|---|
| **Esc** in normal mode | Base UI built-in | `onOpenChange(false)` → guard `!captionEditing` → `onClose()` |
| **Esc** in caption-edit | Base UI built-in | `onOpenChange(false)` → guard `captionEditing` → `cancelCaptionEdit()` (overlay stays open) |
| **Backdrop click** (touch outside img/video/toolbar) | Base UI `Dialog.Backdrop` | `onOpenChange(false)` → same guard |
| **Close X button** click | `<button onClick={onClose}>` | direct `onClose()` (bypasses guard — explicit user signal) |
| **Cancel button** in caption-edit panel | `<button onClick={cancelCaptionEdit}>` | local handler |
| **Tab / Shift+Tab** | Base UI focus trap | cycles within Popup |
| **`←` arrow key** in normal mode | Custom `useEffect` | `goPrev()` |
| **`→` arrow key** in normal mode | Custom `useEffect` | `goNext()` |
| **`←` / `→`** in caption-edit | Effect early return | no-op (textarea handles arrows for caret) |
| **Cmd/Ctrl+Enter** in caption textarea | `onKeyDown` on `<textarea>` | `saveCaption()` |
| **Touch swipe down >80px** | Custom `onTouchStart`/`onTouchEnd` on Popup | direct `onClose()` (bypasses guard — explicit gesture) |
| **Click prev/next chevron buttons** | `<button onClick>` | `goPrev` / `goNext` |
| **Click "more" menu → Удалить** | `<button onClick={handleDelete}>` | native `confirm()` → `onDelete()` (out-of-scope native `confirm()` stays) |

### 5.1 Edge cases

**Close X in caption-edit:** if user clicks the X button while editing caption, the overlay closes immediately (`onClose()` directly bypasses guard). The unsaved caption draft is lost. This matches existing behavior; not introducing a "save unsaved caption?" confirm because caption is a single-field edit, not a full form, and explicit X click is a strong intent signal.

**Swipe-down in caption-edit:** `onTouchStart` has an early `if (captionEditing) return`. Swipes during edit-mode are ignored — user can scroll the textarea on mobile without accidentally closing the overlay. Matches existing behavior.

**Cmd/Ctrl+Enter scope:** the save-on-Cmd+Enter handler is on the textarea's `onKeyDown`, not in the global hotkey effect. It only fires when textarea has focus, which is enforced by edit-mode auto-focusing the textarea (effect #5).

**Auto-close on delete last item:** `handleDelete` contains `if (items.length === 1) onClose()` after the delete completes. `onClose()` direct call works after migration; no caption-edit guard relevance since user is interacting with the kebab menu, not the textarea.

## 6. Visual style (className overrides)

The Lightbox visual is fundamentally custom (full-screen black, white text, no borders/rounded-corners/padding on the container). Tabular summary of class additions:

| Element | className |
|---|---|
| `<DialogPrimitive.Backdrop>` | `fixed inset-0 z-[70] bg-black/90` |
| `<DialogPrimitive.Popup>` | `fixed inset-0 z-[70] flex flex-col text-white outline-none` |

**Inner-content classNames are unchanged.** Toolbar, counter, prev/next chevrons, media region, caption block, hint — all retain their existing classNames byte-for-byte.

**No animation classes** added (`data-open:animate-in` etc.). Lightbox historically opens without animation; preserve that. If we later want fade-in/zoom-in transitions, that's a small follow-up — not blocking 6D2.

## 7. Risks & mitigations

**R1 — `<video controls>` and focus trap.** Video has built-in controls (play/pause, timeline, volume) that should remain Tab-reachable. Base UI focus trap allows standard focusable elements within Popup. **Mitigation:** preview test — open a video item, press Tab repeatedly, confirm focus cycles through toolbar buttons + video controls + prev/next chevrons + caption controls (when present).

**R2 — Touch swipe-down generating synthesized click.** On some touch devices, after a swipe, the browser may also fire a `click` event on the element where the touch ended. If the touch ends on the Backdrop, this could cause `onOpenChange(false)` (synthesized backdrop click) to fire after our `onClose()` from the swipe handler — double-firing. **Mitigation:** in `onTouchEnd` swipe-detected branch, call `e.preventDefault()` to suppress the synthesized click. Verify in preview on a touch device or via DevTools touch emulation.

**R3 — `outline-none` on Popup hiding focus ring on focusable children.** `outline-none` on `Popup` is intentional (Base UI focuses the Popup itself on mount; we don't want a viewport-edge outline). Children should NOT inherit `outline-none` because each interactive button has its own `focus-visible:outline-2 focus-visible:outline-white/60` rule that creates its own focus ring. **Mitigation:** preview test — Tab through all interactive elements, confirm each shows its white focus ring.

**R4 — Auto-close on delete last item bypasses guard.** When `handleDelete` completes its async work and the items list had only 1 item, it calls `onClose()` directly. This bypasses the `captionEditing` guard. **Verification:** caption-edit mode is mutually exclusive with kebab-menu open (clicking "Edit caption" closes the kebab menu via `setMenuOpen(false)` indirectly through state changes); user cannot enter caption-edit AND click Delete without first leaving caption-edit. Behavior preserved.

**R5 — Three consumers depend on existing prop signature.** `PhotoGalleryTab`, `VideoGalleryTab`, `TaskReportCard` import and render `ClientLightbox` with `{ items, initialIndex, onClose, onDelete, onUpdateCaption }`. **Mitigation:** prop signature unchanged. Consumers untouched.

**R6 — Project-wide `fixed inset-0` grep acceptance.** The 6D acceptance grep had `ClientLightbox` in the exclusion list (deferred status). After 6D2, `ClientLightbox` still uses `fixed inset-0` in className strings (on `Backdrop` and `Popup`), but now as a legitimate Base UI primitive consumer. **Decision:** keep `ClientLightbox` in the exclusion list permanently. The acceptance grep stays:

```bash
grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"
```

This grep returns empty after 6D and continues to return empty after 6D2 (no regression introduced).

**R7 — No tests for behavior changes.** Lightbox has no `*.test.jsx` file. Migration risks regressing UX without test coverage. **Mitigation:** preview-tools manual verification per §8 acceptance criteria. If any case fails, fix before opening PR.

## 8. Acceptance criteria

1. `clients/ClientLightbox.jsx` migrated to `<DialogPrimitive.Root>` + `<Portal>` + `<Backdrop>` + `<Popup>`.
2. 2 `useEffect` blocks deleted (focus management, body scroll lock).
3. 1 `useEffect` block trimmed (hotkeys: only `←`/`→` remain, Esc removed).
4. 3 `useRef` declarations deleted (`closeBtnRef`, `previouslyFocused`, `dialogRef`). `captionRef` preserved.
5. `autoFocus` attribute on close-X button.
6. `onOpenChange` guard correctly handles caption-edit Esc/backdrop interception.
7. Touch swipe handlers preserved on `Popup`; swipe-detected branch calls `e.preventDefault()` to suppress synthesized click.
8. Three consumers (`PhotoGalleryTab`, `VideoGalleryTab`, `TaskReportCard`) untouched.
9. Project-wide grep `grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"` returns empty (matches 6D acceptance gate).
10. Preview verification covers:
    - Open Lightbox from Photo gallery → render image, navigate `←`/`→`, Esc closes
    - Open Lightbox with video → video controls Tab-reachable
    - Edit caption → Esc cancels edit (overlay stays), Cmd/Ctrl+Enter saves
    - Click outside (Backdrop) closes; click X closes; swipe-down on touch closes
    - Click "more" menu → Удалить → native confirm → delete + auto-close if last item
11. `npm run lint` shows no new errors in `ClientLightbox.jsx`. `npm run test:run` passes 235/235.
12. Single PR (no waves needed — 1 file).

## 9. Open questions

None. All design decisions captured during brainstorm:

- Primitive: Base UI `Dialog` directly (not shadcn `<Dialog>`) — Q1 = B
- Initial focus: close-X button via `autoFocus` — Q2 = a
- Esc semantic in caption-edit: `onOpenChange` guard intercepts — Q3 = A
- Backdrop click: rely on Base UI `Backdrop`-click — Q4 = A
- Tests: preserve baseline (no tests added) — Q5 = b
