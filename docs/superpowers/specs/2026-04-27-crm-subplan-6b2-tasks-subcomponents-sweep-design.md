# CRM Subplan 6B2 — Tasks sub-components DS sweep · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family C second sweep. Pure DS-token + shadcn-primitive swap of all Tasks sub-components (detail panel + cards + slide-out + confirm dialogs) deferred during 6A5 master-layer sweep.

**Builds on:**
- [Subplan 6B1 Staff sub-components spec](2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md) — established the Family C pattern (rules table, destructive-emphasis rule, hand-rolled-modal preservation). 6B2 reuses the rules table verbatim.
- [Subplan 6A5 TaskList master swap](../plans/2026-04-26-crm-subplan-5-tasks.md) — already swept master-layer files (TaskListPage + TaskList/TaskListItem + EmptyZero/EmptyFilter/DetailEmptyHint + TaskFilterChips). Out of scope.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind-палитру (`slate-*`, `indigo-*`, `red-*`) и raw `<button>` со старыми utility-классами (`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost`) в 7 sub-component файлах модуля Tasks на DS-токены и shadcn primitives. Логика и структура каждого файла без изменений.

**В scope (7 файлов, ~2123 LOC, 21 legacy hits):**

**Detail panel (1 файл, 456 LOC):**
- `src/components/tasks/TaskDetailPanel.jsx` (456 LOC, 4 hits)

**Cards (3 файла, 1133 LOC):**
- `src/components/tasks/TaskFieldsCard.jsx` (296 LOC, 4 hits)
- `src/components/tasks/TaskDescriptionCard.jsx` (114 LOC, 2 hits)
- `src/components/tasks/TaskReportCard.jsx` (723 LOC, 3 hits)

**Slide-out (1 файл, 364 LOC):**
- `src/components/tasks/CreateTaskSlideOut.jsx` (364 LOC, 4 hits)

**Confirm dialogs (2 файла, 170 LOC):**
- `src/components/tasks/CancelTaskConfirmDialog.jsx` (79 LOC, 2 hits)
- `src/components/tasks/DeleteTaskConfirmDialog.jsx` (91 LOC, 2 hits)

**Already DS-clean (verified 0 hits — out of scope):**
- `AssigneeSelector.jsx` (230 LOC)
- `TaskActivityCard.jsx` (129 LOC)
- `TaskBoxTabs.jsx` (47 LOC)

**Already swept in 6A5 (master layer — out of scope):**
- `TaskList.jsx`, `TaskListItem.jsx`, `EmptyZero.jsx`, `EmptyFilter.jsx`, `DetailEmptyHint.jsx`, `TaskFilterChips.jsx`

**Rules table:** Identical to Subplan 6B1 §1 (slate/indigo/red → DS tokens; raw `<button>` → shadcn `<Button>` per CTA / secondary / destructive distinction; raw `<input>` → shadcn `<Input>`; inline SVG → lucide). Including the **destructive-emphasis rule**: destructive primary (`bg-red-600 text-white`) → `<Button variant="destructive">`; destructive secondary (`.btn-danger-ghost`, `border-red-…` outline) → `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

**Out of scope (deferred):**

- **shadcn `<Dialog>` / `<Sheet>` migration** for `CreateTaskSlideOut` (slide-out) and the 2 confirm dialogs — Subplan 6D will handle hand-rolled modal/slide-out overlays project-wide.
- **Photo-upload UX in `TaskReportCard`** — only token swap on existing visual surfaces, no UX redesign.
- **Structural refactor** of any file. Pure visual work.
- **`.btn-*` utility-class definitions in `src/index.css`** — Subplan 6C, after 6B2-6B4 land.

---

## 2. File-level diff summary

**Modified (7):** all files listed in §1.
**Created:** none.
**Deleted:** none.

**Estimated PR size:** ~80-120 lines diff total (insertions ≈ deletions, since most edits are class swaps + element-tag swaps).

---

## 3. Behaviour contracts (preserved)

For each file: every prop, every state variable, every RPC call, every hook usage, every event handler — **identical**. The diff should read as «I replaced classes X with classes Y, swapped raw `<button>` to `<Button>`, possibly added one or two lucide icon imports». If any file produces a behavioural change in the diff, that's a bug.

The existing test suite covers `CreateTaskSlideOut.test.jsx` and `TaskList.test.jsx` (the latter is in 6A5 territory and is unaffected here, but still must stay green). After 6B2, all 235 tests must pass.

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes).
- `npm run lint` no new warnings introduced in the 7 modified files.
- Tightened grep audit: `grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" src/components/tasks/{TaskDetailPanel,TaskFieldsCard,TaskDescriptionCard,TaskReportCard,CreateTaskSlideOut,CancelTaskConfirmDialog,DeleteTaskConfirmDialog}.jsx` returns no output.
- Browser preview `/tasks/<taskId>`:
  - Detail panel header + cards (Description/Fields/Report/Activity) render with DS-token surfaces.
  - Slide-out (`+ Новая` task) opens with DS tokens; submit button rendered as shadcn `<Button>`.
  - Confirm dialogs for «Отменить задачу» and «Удалить задачу» render destructive primary correctly (`variant="destructive"`).
- No console errors related to this change.

---

## 5. Implementation order

Single batched PR with 4 task groups:

1. **Confirm dialogs** (2 files, 170 LOC, 4 hits) — smallest tier, quick wins. Both have a destructive-primary submit + a cancel — apply destructive-emphasis rule.
2. **Cards** (3 files, 1133 LOC, 9 hits) — `TaskDescriptionCard`, `TaskFieldsCard`, `TaskReportCard` (largest at 723 LOC; only 3 hits; identify them via grep first).
3. **Detail panel** (1 file, 456 LOC, 4 hits) — `TaskDetailPanel` is the wrapper around tab cards.
4. **Slide-out** (1 file, 364 LOC, 4 hits) — `CreateTaskSlideOut`.

After all 7 are edited:

- Run build, tests, lint.
- Run final grep audit (acceptance criterion above).
- Browser preview tour (one card per visible state, both confirm dialogs, slide-out open).
- Push + PR + merge.

---

## 6. Notes for follow-up subplans

- **6B3 / 6B4** apply the same pattern to Teams / Clients sub-components.
- **6C** removes the `.btn-*` utility-class definitions from `src/index.css` once 6B2-6B4 land.
- **6D** migrates hand-rolled `fixed inset-0` modal overlays + slide-outs project-wide to shadcn `<Dialog>` / `<Sheet>`. Decoupled from the colour-token sweep.
