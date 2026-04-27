# CRM Subplan 6B1 — Staff sub-components DS sweep · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family C first sweep. Pure DS-token swap of all Staff sub-components (tabs + modals + utility blocks) that were deferred during 6A8 architectural migration.

**Builds on:**
- [Subplan 6A8 StaffList master-detail spec](2026-04-27-crm-subplan-6a8-stafflist-master-detail-design.md) — established the migration; explicitly deferred detail-tab + modal DS-swap to «future subplan» (this one).
- [Subplan 6A4 ClientList spec](2026-04-27-crm-subplan-6a4-clientlist-repaint-design.md) — established the «pure token swap» pattern reused here.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind-палитру (`slate-*`, `indigo-*`, `red-*`) и raw `<button>` со старыми utility-классами (`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost`) в 14 sub-component файлах модуля Staff на DS-токены и shadcn `<Button>`. Логика и структура каждого файла без изменений. Никаких новых компонентов, никакой переписи поведения.

**В scope (14 файлов, ~1546 LOC, ~63 legacy hits):**

**Tabs (4 файла, 263 LOC):**
- `src/components/staff/ProfileTab.jsx` (112 LOC, 7 hits)
- `src/components/staff/AttributesTab.jsx` (87 LOC, 9 hits)
- `src/components/staff/PermissionsTab.jsx` (54 LOC, 4 hits)
- `src/components/staff/ActivityTab.jsx` (10 LOC, 3 hits)

**Modals (6 файлов, 899 LOC):**
- `src/components/staff/ChangePasswordModal.jsx` (81 LOC, 10 hits)
- `src/components/staff/DeleteRequestModal.jsx` (42 LOC, 5 hits)
- `src/components/staff/ApprovalReviewModal.jsx` (58 LOC, 11 hits)
- `src/components/staff/ChangeTeamModal.jsx` (201 LOC, 2 hits)
- `src/components/staff/AddCuratedOperatorsModal.jsx` (288 LOC, 3 hits)
- `src/components/staff/ChangeCuratorModal.jsx` (229 LOC, 2 hits)

**Utility blocks (4 файла, 384 LOC):**
- `src/components/staff/CuratorBlock.jsx` (89 LOC, 1 hit)
- `src/components/staff/CuratedOperatorsBlock.jsx` (187 LOC, 3 hits)
- `src/components/staff/TeamMembershipBlock.jsx` (85 LOC, 1 hit)
- `src/components/staff/RefCodePreview.jsx` (23 LOC, 2 hits)

**Стандартные замены (тот же паттерн что 6A4-6A10):**

| Legacy class | DS token / shadcn primitive |
|---|---|
| `text-slate-{700,800,900} dark:text-slate-{100,200,300}` | `text-foreground` |
| `text-slate-{400,500,600} dark:text-slate-{400,500}` | `text-muted-foreground` |
| `bg-white dark:bg-slate-800` (card surface) | `bg-card` |
| `border-slate-{200,300,700} dark:border-slate-{600,700}` | `border-border` (или `border-input` для form inputs) |
| `bg-slate-100 dark:bg-slate-{800,900}` (subtle surface) | `bg-muted` |
| `bg-indigo-600 hover:bg-indigo-700 text-white` (CTA) | shadcn `<Button>` default variant |
| `text-indigo-{600,800} bg-indigo-{50,100}` (highlight) | `text-primary bg-primary/10` |
| `bg-red-{50,100} dark:bg-red-900/20` (danger surface) | `bg-[var(--danger-soft)]` |
| `text-red-{500,600,700} dark:text-red-{300,400}` (danger text) | `text-[var(--danger-ink)]` |
| `border-red-{200,800}` (danger border) | `border-[var(--danger-strong)]` |
| `.btn-primary` (utility class) | shadcn `<Button>` default variant |
| `.btn-ghost` | shadcn `<Button variant="ghost">` |
| `.btn-danger-ghost` (destructive **secondary**) | shadcn `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| Raw `<button className="bg-red-600 … text-white">` (destructive **primary** — high-prominence confirm of a destructive flow) | shadcn `<Button variant="destructive">` |
| **Preserve destructive emphasis** | When the legacy code distinguishes a destructive primary (`bg-red-600 text-white`) from a destructive secondary (`.btn-danger-ghost` or `border-red-…` outline), preserve that distinction. Don't downgrade primaries to ghosts and don't promote secondaries to primaries. The button that triggers the actual destructive RPC is the destructive one — even if it's labelled «Подтвердить» rather than «Удалить». |
| Raw `<input>` with slate/indigo styling | shadcn `<Input>` |
| Raw `<select>` | shadcn `<Select>` if it's a small set; keep native `<select>` styled with DS-tokens if it's a large dynamic list |
| Inline SVG warning/info icon | lucide `<AlertCircle>` / `<Info>` / `<Check>` (project convention) |

**Out of scope (deferred):**

- **shadcn `<Dialog>` migration for the 6 modals** — currently they're hand-rolled `fixed inset-0` div+backdrop overlays. Migrating to `<Dialog>` gives proper focus-trap, Esc handling, `role="dialog"`, `aria-modal`, but is an architectural change. **Tracked as separate future Subplan 6D**. Within 6B1 modals stay as div-overlays — only their colours and buttons get swapped. 6D will be brainstormed independently after 6B2-6B4 + 6C.
- **5-color role-badge palette** — no role-badge rendered in any of the 14 files (those live in `StaffListItem` / `StaffDetailPanel` from 6A8). Not relevant here.
- **Structural refactor** of any file (extracting helpers, splitting large modals, etc.). Pure visual work.
- **`.btn-*` utility classes removal from `src/index.css`** — happens after 6B1-6B4 land, in Subplan 6C. Within 6B1 we stop using these classes; the definitions stay in `index.css` until all four module sweeps complete.
- **Animation polish, transitions, density tweaks** — DS-revamp follow-up.

---

## 2. File-level diff summary

**Modified (14):** all files listed in §1.
**Created:** none.
**Deleted:** none.

**Estimated PR size:** ~250-350 lines diff total (insertions + deletions roughly balance because we're swapping classes, not adding logic).

---

## 3. Behaviour contracts (preserved)

For each file: every prop, every state variable, every RPC call, every hook usage, every event handler — **identical**. The diff should be readable as «I replaced classes X with classes Y, swapped raw `<button>` to `<Button>`, and added one or two icon imports». If any file produces a behavioural change in the diff, that's a bug.

The existing test suite covers the only file with direct unit tests (`PermissionsTab.test.jsx`, post-6A8); all other Staff sub-components are presentational and verified through preview. After 6B1, all 235 tests must still pass.

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes).
- `npm run lint` no new warnings introduced in the 14 modified files (pre-existing repo-wide warnings unrelated to Staff are acceptable).
- `grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/*.jsx` returns **only** `StaffListItem.jsx` and `StaffDetailPanel.jsx` (the documented DS-exception 5-color role badges) — every other Staff file should be clean.
- Browser preview `/staff/<refCode>`:
  - All 4 tabs render with DS-token surfaces (`bg-card`, `text-foreground`, etc.) — visible in network/screenshot per tab.
  - Modal flows reachable from headers + blocks (Change Password, Request Deletion, Change Team, Add Curated Operators, Change Curator) open without console errors and render with DS tokens.
- No console errors related to this change (pre-existing HMR warnings about deleted Staff* files from earlier sessions are acceptable).

---

## 5. Implementation order

Single batched PR with the 14 file edits. Suggested grouping for the implementer:

1. Easy tier (low LOC, high hits): `ChangePasswordModal`, `ApprovalReviewModal`, `DeleteRequestModal`, `RefCodePreview` — quick wins, mechanical swaps.
2. Tabs: `ProfileTab`, `AttributesTab`, `PermissionsTab`, `ActivityTab`.
3. Utility blocks: `CuratorBlock`, `CuratedOperatorsBlock`, `TeamMembershipBlock`.
4. Big modals (low hits but large LOC): `ChangeTeamModal`, `ChangeCuratorModal`, `AddCuratedOperatorsModal`. These are larger but only have a few legacy hits each — most of the file is logic.

After all 14 are edited:

- Run build, tests, lint.
- Run final grep audit (acceptance criterion above).
- Browser preview tour (each tab + open at least one modal).
- Single commit with all changes.
- Push + PR + merge.

---

## 6. Notes for follow-up subplans

- **6B2 / 6B3 / 6B4** apply the same pattern to Tasks / Teams / Clients sub-components.
- **6C** removes the `.btn-*` utility-class definitions from `src/index.css` once 6B1-6B4 land.
- **6D (new on roadmap)** migrates the hand-rolled modal overlays (Staff + Tasks + Teams + Clients) to shadcn `<Dialog>` for proper a11y. Decoupled from the colour-token sweep so each can be reviewed independently.
