# CRM Subplan 6B4 — Clients sub-components DS sweep · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family C **fourth and final sweep**. Pure DS-token + shadcn-primitive swap of all Clients sub-components (profile tab + gallery tabs + lightbox + slide-out + confirm dialogs) deferred during 6A4 master-layer sweep.

**Builds on:**
- [Subplan 6B1 Staff sub-components spec](2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md) — established the Family C pattern.
- [Subplan 6B2 Tasks sub-components spec](2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep-design.md) — applied to Tasks.
- [Subplan 6B3 Teams sub-components spec](2026-04-27-crm-subplan-6b3-teams-subcomponents-sweep-design.md) — applied to Teams.
- [Subplan 6A4 ClientList master swap](../plans/2026-04-25-crm-subplan-3-clients.md) — already swept master-layer files (ClientListPage + ClientList/ClientListItem + EmptyZero/EmptyFilter/DetailEmptyHint + ClientFilterChips + BulkActionBar + DropOverlay). Out of scope.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind-палитру (`slate-*`, `indigo-*`, `red-*`) и raw `<button>` со старыми utility-классами (`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost`) в 7 sub-component файлах модуля Clients на DS-токены и shadcn primitives. Логика и структура каждого файла без изменений.

**В scope (7 файлов, ~3402 LOC, 18 legacy hits):**

**Profile tab (1 файл, 448 LOC):**
- `src/components/clients/ProfileTab.jsx` (448 LOC, 2 hits)

**Gallery tabs (2 файла, 1816 LOC):**
- `src/components/clients/PhotoGalleryTab.jsx` (832 LOC, 3 hits)
- `src/components/clients/VideoGalleryTab.jsx` (984 LOC, 5 hits)

**Lightbox (1 файл, 430 LOC):**
- `src/components/clients/ClientLightbox.jsx` (430 LOC, 2 hits)

**Slide-out (1 файл, 582 LOC):**
- `src/components/clients/CreateClientSlideOut.jsx` (582 LOC, 3 hits)

**Confirm dialogs (2 файла, 126 LOC):**
- `src/components/clients/CreateClientCloseConfirm.jsx` (62 LOC, 1 hit)
- `src/components/clients/ArchiveConfirmDialog.jsx` (64 LOC, 2 hits)

**Already DS-clean (verified 0 hits — out of scope):**
- `ActivityCard.jsx` (140 LOC)
- `ClientDetailPanel.jsx` (381 LOC)
- `SummaryCard.jsx` (206 LOC)

**Already swept in 6A4 (master layer — out of scope):**
- `ClientList.jsx`, `ClientListItem.jsx`, `EmptyZero.jsx`, `EmptyFilter.jsx`, `DetailEmptyHint.jsx`, `ClientFilterChips.jsx`, `BulkActionBar.jsx`, `DropOverlay.jsx`

**Rules table:** Identical to Subplan 6B1 §1 (slate/indigo/red → DS tokens; raw `<button>` → shadcn `<Button>` per CTA / secondary / destructive distinction; raw `<input>` → shadcn `<Input>`; inline SVG → lucide). Including the **destructive-emphasis rule**: destructive primary (`bg-red-600 text-white`) → `<Button variant="destructive">`; destructive secondary (`.btn-danger-ghost`, `border-red-…` outline) → `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

**Out of scope (deferred):**

- **shadcn `<Dialog>` / `<Sheet>` migration** for `CreateClientSlideOut`, `ClientLightbox`, the 2 confirm dialogs — Subplan 6D will handle hand-rolled modal/slide-out overlays project-wide.
- **Photo/Video gallery UX** — drag-drop, upload progress, bulk select, swipe gestures, lightbox keyboard nav are all complex existing flows. **Touch ONLY the 8 hit lines across the gallery tabs (3+5). Do NOT redesign or refactor.**
- **ClientLightbox keyboard handling, fullscreen, navigation** — the 2 hits should be on close/action buttons; the rest of the viewer logic stays intact.
- **Structural refactor** of any file. Pure visual work.
- **`.btn-*` utility-class definitions in `src/index.css`** — **Subplan 6C runs immediately after 6B4** (this is the last consumer; once 6B4 lands, no production code references these classes).

---

## 2. File-level diff summary

**Modified (7):** all files listed in §1.
**Created:** none.
**Deleted:** none.

**Estimated PR size:** ~70-100 lines diff total. Despite 3402 LOC of total touched-file size, only 18 hits = ~18 line replacements + import additions.

---

## 3. Behaviour contracts (preserved)

For each file: every prop, every state variable, every RPC call, every hook usage, every event handler — **identical**. The diff should read as «I replaced classes X with classes Y, swapped raw `<button>` to `<Button>`, possibly added one or two icon imports».

For the gallery tabs and lightbox specifically: drag-drop, upload-progress, lightbox-state, keyboard-nav, swipe-gestures must be **byte-for-byte identical** to pre-6B4. The diff should be 3-5 lines per tab, not a refactor.

The existing test suite covers `CreateClientSlideOut.test.jsx` (if present), `ClientLightbox.test.jsx` (if present), and any other Clients unit tests. After 6B4, all 235 tests must pass.

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes).
- `npm run lint` no new warnings introduced in the 7 modified files.
- Tightened grep audit: `grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" src/components/clients/{ProfileTab,PhotoGalleryTab,VideoGalleryTab,ClientLightbox,CreateClientSlideOut,CreateClientCloseConfirm,ArchiveConfirmDialog}.jsx` returns no output.
- Out-of-scope verification: `ActivityCard`, `ClientDetailPanel`, `SummaryCard` remain `clean` (untouched).
- Browser preview `/clients/<clientId>`:
  - Profile tab renders with DS-token surfaces.
  - Photo and video gallery tabs render with DS tokens; existing upload UX intact (no regression).
  - Lightbox opens with DS-token close/action buttons; keyboard nav still works.
  - Create-client slide-out opens with DS tokens; submit/cancel render correctly; close-confirm dialog appears on dirty-close.
  - Archive confirm dialog renders destructive treatment matching original.
- No console errors related to this change.

**Critical post-6B4 milestone:** After 6B4 merges, `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` are unreferenced in production code (verify via grep across `src/`). This unblocks Subplan 6C — the final cleanup that removes those CSS class definitions from `src/index.css`.

---

## 5. Implementation order

Single batched PR with 4 task groups, smallest-first to anchor the pattern before tackling the gallery tabs:

1. **Confirm dialogs** (2 files, 126 LOC, 3 hits) — `CreateClientCloseConfirm`, `ArchiveConfirmDialog`. Honour destructive-emphasis on archive.
2. **Profile tab + lightbox** (2 files, 878 LOC, 4 hits) — `ProfileTab`, `ClientLightbox`. Both have low hit counts; touch only the hit lines.
3. **Slide-out** (1 file, 582 LOC, 3 hits) — `CreateClientSlideOut`. Footer pair likely + maybe an inline action.
4. **Gallery tabs** (2 files, 1816 LOC, 8 hits) — `PhotoGalleryTab`, `VideoGalleryTab`. **The largest task** by file size; **stay surgical** — only hit lines, do NOT touch upload/drag/select logic.

After all 7 are edited:

- Run build, tests, lint.
- Run final grep audit (acceptance criterion above).
- Browser preview tour (one tab + lightbox open + create slide-out + archive confirm).
- Push + PR + merge.

---

## 6. Notes for follow-up subplans

- **6C** removes the `.btn-*` utility-class definitions from `src/index.css` once 6B4 lands. After 6B4, no production code references them, so the cleanup is a pure CSS deletion + grep audit.
- **6D** migrates hand-rolled modal/slide-out overlays project-wide to shadcn `<Dialog>` / `<Sheet>`. Decoupled from the colour-token sweep.
- **Auth security migration** — separate backlog spec at `2026-04-27-auth-security-migration-design.md` (DRAFT, awaiting 5 architectural decisions).
