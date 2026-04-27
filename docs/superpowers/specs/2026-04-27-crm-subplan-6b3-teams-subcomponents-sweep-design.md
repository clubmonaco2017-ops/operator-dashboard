# CRM Subplan 6B3 — Teams sub-components DS sweep · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family C third sweep. Pure DS-token + shadcn-primitive swap of all Teams sub-components (tabs + slide-out + modals + confirm dialog) deferred during 6A7 master-layer sweep.

**Builds on:**
- [Subplan 6B1 Staff sub-components spec](2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md) — established the Family C pattern (rules table, destructive-emphasis rule, hand-rolled-modal preservation). 6B3 reuses the rules table verbatim.
- [Subplan 6B2 Tasks sub-components spec](2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep-design.md) — applied the same pattern to Tasks; 6B3 mirrors that for Teams.
- [Subplan 6A7 TeamList master swap](../plans/2026-04-25-crm-subplan-4-teams.md) — already swept master-layer files (TeamListPage + TeamList/TeamListItem + EmptyZero/EmptyFilter/DetailEmptyHint + TeamFilterChips). Out of scope.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind-палитру (`slate-*`, `indigo-*`, `red-*`) и raw `<button>` со старыми utility-классами (`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost`) в 8 sub-component файлах модуля Teams на DS-токены и shadcn primitives. Логика и структура каждого файла без изменений.

**В scope (8 файлов, ~1641 LOC, 17 legacy hits):**

**Tabs (3 файла, 612 LOC):**
- `src/components/teams/TeamMembersTab.jsx` (218 LOC, 3 hits)
- `src/components/teams/TeamClientsTab.jsx` (185 LOC, 3 hits)
- `src/components/teams/TeamActivityTab.jsx` (209 LOC, 1 hit)

**Slide-out (1 файл, 299 LOC):**
- `src/components/teams/CreateTeamSlideOut.jsx` (299 LOC, 2 hits)

**Modals (3 файла, 657 LOC):**
- `src/components/teams/AddMemberModal.jsx` (197 LOC, 2 hits)
- `src/components/teams/AddClientsModal.jsx` (229 LOC, 2 hits)
- `src/components/teams/ChangeLeadModal.jsx` (231 LOC, 2 hits)

**Confirm dialog (1 файл, 73 LOC):**
- `src/components/teams/ArchiveTeamConfirmDialog.jsx` (73 LOC, 2 hits)

**Already DS-clean (verified 0 hits — out of scope):**
- `TeamDetailPanel.jsx` (441 LOC)
- `ReadOnlyBadge.jsx` (17 LOC)

**Already swept in 6A7 (master layer — out of scope):**
- `TeamList.jsx`, `TeamListItem.jsx`, `EmptyZero.jsx`, `EmptyFilter.jsx`, `DetailEmptyHint.jsx`, `TeamFilterChips.jsx`

**Rules table:** Identical to Subplan 6B1 §1 (slate/indigo/red → DS tokens; raw `<button>` → shadcn `<Button>` per CTA / secondary / destructive distinction; raw `<input>` → shadcn `<Input>`; inline SVG → lucide). Including the **destructive-emphasis rule**: destructive primary (`bg-red-600 text-white`) → `<Button variant="destructive">`; destructive secondary (`.btn-danger-ghost`, `border-red-…` outline) → `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

**Out of scope (deferred):**

- **shadcn `<Dialog>` / `<Sheet>` migration** for `CreateTeamSlideOut` (slide-out), the 3 modals, and the confirm dialog — Subplan 6D will handle hand-rolled modal/slide-out overlays project-wide.
- **Structural refactor** of any file. Pure visual work.
- **`.btn-*` utility-class definitions in `src/index.css`** — Subplan 6C, after 6B4 lands.

---

## 2. File-level diff summary

**Modified (8):** all files listed in §1.
**Created:** none.
**Deleted:** none.

**Estimated PR size:** ~50-80 lines diff total (insertions ≈ deletions).

---

## 3. Behaviour contracts (preserved)

For each file: every prop, every state variable, every RPC call, every hook usage, every event handler — **identical**. The diff should read as «I replaced classes X with classes Y, swapped raw `<button>` to `<Button>`, possibly added one or two icon imports».

The existing test suite covers `CreateTeamSlideOut.test.jsx`, `TeamMembersTab.test.jsx` (if present), and any other Teams unit tests. After 6B3, all 235 tests must pass.

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes).
- `npm run lint` no new warnings introduced in the 8 modified files.
- Tightened grep audit: `grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" src/components/teams/{TeamMembersTab,TeamClientsTab,TeamActivityTab,CreateTeamSlideOut,AddMemberModal,AddClientsModal,ChangeLeadModal,ArchiveTeamConfirmDialog}.jsx` returns no output.
- Out-of-scope verification: `grep -nE …` against `TeamDetailPanel,ReadOnlyBadge` should remain `clean`.
- Browser preview `/teams/<teamId>`:
  - All 3 tabs (Состав / Клиенты / Активность) render with DS-token surfaces.
  - Slide-out (`+ Новая` команда) opens with DS tokens; submit button rendered as shadcn `<Button>`.
  - Modal flows (Add member, Add clients, Change lead) open with DS tokens; primary buttons render correctly.
  - Archive confirm dialog renders with destructive treatment matching the original (primary or secondary).
- No console errors related to this change.

---

## 5. Implementation order

Single batched PR with 4 task groups:

1. **Confirm dialog** (1 file, 73 LOC, 2 hits) — `ArchiveTeamConfirmDialog`. Honour destructive-emphasis rule for the submit button.
2. **Tabs** (3 files, 612 LOC, 7 hits) — `TeamMembersTab`, `TeamClientsTab`, `TeamActivityTab`. Watch for inline destructive-secondary buttons («Снять с команды» / «Снять клиента»).
3. **Slide-out** (1 file, 299 LOC, 2 hits) — `CreateTeamSlideOut`.
4. **Modals** (3 files, 657 LOC, 6 hits) — `AddMemberModal`, `AddClientsModal`, `ChangeLeadModal`.

After all 8 are edited:

- Run build, tests, lint.
- Run final grep audit (acceptance criterion above).
- Browser preview tour (one tab + one modal flow).
- Push + PR + merge.

---

## 6. Notes for follow-up subplans

- **6B4** applies the same pattern to Clients sub-components (~10 files, ~4129 LOC — biggest, has Photo/Video gallery tabs + ClientLightbox).
- **6C** removes the `.btn-*` utility-class definitions from `src/index.css` once 6B4 lands.
- **6D** migrates hand-rolled modal/slide-out overlays project-wide to shadcn `<Dialog>` / `<Sheet>`.
