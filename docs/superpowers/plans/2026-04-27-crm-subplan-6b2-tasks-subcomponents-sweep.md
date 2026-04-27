# CRM Subplan 6B2 — Tasks sub-components DS sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token + shadcn-`<Button>` swap across 7 Tasks sub-components (1 detail panel + 3 cards + 1 slide-out + 2 confirm dialogs, ~2123 LOC, 21 legacy hits) with no behaviour or structural changes.

**Architecture:** Mechanical class-replacement work driven by the same rule table that powered Subplan 6B1. Tasks group files by tier (confirm dialogs / cards / detail panel / slide-out). Within each task, the implementer reads each file, applies the rule table, replaces raw `<button>`/`<input>` with shadcn primitives, and verifies build/tests stay green.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>` / `<Input>` + lucide-react. No new tests (presentational; existing `CreateTaskSlideOut.test.jsx` covers the only test-covered file in this set).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep-design.md`](../specs/2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep-design.md)

**Reference patterns:**
- Subplan 6B1 commits on branch `feat/subplan-6b1-staff-subcomponents-sweep` (merged in PR #30) — the canonical pattern for Family C sweeps.
- `src/components/staff/ChangePasswordModal.jsx` (post-6B1) — shadcn `<Button>` + lucide icon usage in modals.
- `src/components/staff/DeleteRequestModal.jsx` (post-6B1) — destructive-primary submit + ghost cancel pattern.
- `src/components/staff/CreateStaffSlideOut.jsx` — slide-out with shadcn primitives + danger error block.

---

## Rules table (apply uniformly to every file in this subplan)

Identical to Subplan 6B1 rules. Reproduced verbatim here so the implementer has a single source of truth.

| Legacy class / element | DS replacement |
|---|---|
| `text-slate-{700,800,900} dark:text-slate-{100,200,300}` | `text-foreground` |
| `text-slate-{400,500,600} dark:text-slate-{400,500}` | `text-muted-foreground` |
| `bg-white dark:bg-slate-800` (card surface) | `bg-card` |
| `border-slate-{200,300} dark:border-slate-{600,700}` (card border) | `border-border` |
| `border-slate-{300} dark:border-slate-{600}` (form-input border) | `border-input` |
| `bg-slate-100 dark:bg-slate-{800,900}` (subtle surface) | `bg-muted` |
| `bg-indigo-600 hover:bg-indigo-700 text-white` (CTA primary) | shadcn `<Button>` default variant |
| `text-indigo-{600,800} bg-indigo-{50,100}` (highlight chip) | `text-primary bg-primary/10` |
| `text-indigo-600` (link/accent) | `text-primary` |
| `focus:ring-indigo-{400,500}` | `focus:ring-[var(--primary-ring)]` (or remove if using shadcn `<Input>`/`<Button>` which set their own focus styles) |
| `placeholder-slate-400` | `placeholder:text-[var(--fg4)]` |
| `bg-red-{50,100} dark:bg-red-900/20` (danger surface) | `bg-[var(--danger-soft)]` |
| `text-red-{500,600,700} dark:text-red-{300,400}` (danger text) | `text-[var(--danger-ink)]` |
| `border-red-{200,800}` (danger border) | `border-[var(--danger-strong)]` |
| Raw `<button className="bg-indigo-600 …">` (CTA primary) | `<Button onClick={…}>label</Button>` |
| Raw `<button className="rounded-lg border border-slate-200 …">` (secondary/cancel) | `<Button variant="ghost">label</Button>` (or `variant="outline"` if border treatment is desired) |
| **Destructive primary** (`bg-red-600 text-white`) | `<Button variant="destructive">` |
| **Destructive secondary** (`.btn-danger-ghost`, `border-red-…` outline) | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| `.btn-primary` utility | `<Button>` default variant |
| `.btn-ghost` utility | `<Button variant="ghost">` |
| `.btn-danger-ghost` utility | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| Raw `<input>` with custom slate/indigo styling | shadcn `<Input>` — drop the bespoke className |
| Raw `<select>` (≤ 6 static options) | shadcn `<Select>` if clean drop-in, otherwise keep native and DS-token the className |
| Raw `<select>` (dynamic large list) | keep native `<select>`, DS-token the className |
| Inline SVG warning/info/check icon | lucide `<AlertCircle>` / `<Info>` / `<Check>` |
| Hand-rolled spinner SVG | lucide `<Loader2 className="animate-spin">` |

**Preserve destructive emphasis:** When the legacy code distinguishes a destructive primary (`bg-red-600 text-white`) from a destructive secondary (`.btn-danger-ghost` or `border-red-…` outline), preserve that distinction. The button that triggers the actual destructive RPC is the destructive one — even if labelled «Подтвердить» rather than «Удалить».

**What NOT to do:**

- Do NOT change `useState`, `useEffect`, RPC call signatures, prop names, conditional render structure, JSX tree shape, or any handler logic. Pure visual change.
- Do NOT migrate hand-rolled `fixed inset-0` modal overlays / hand-rolled slide-outs to shadcn `<Dialog>` / `<Sheet>`. That is Subplan 6D.
- Do NOT remove `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions from `src/index.css`. That is Subplan 6C.
- Do NOT touch any file beyond the 7 listed.
- Do NOT touch `AssigneeSelector.jsx`, `TaskActivityCard.jsx`, `TaskBoxTabs.jsx` (verified DS-clean already), or any master-layer file (`TaskList`, `TaskListItem`, etc., already swept in 6A5).
- Do NOT add unused imports.

---

## File Structure

**Modified (7):**
- Confirm dialogs: `CancelTaskConfirmDialog.jsx`, `DeleteTaskConfirmDialog.jsx` (170 LOC, 4 hits)
- Cards: `TaskDescriptionCard.jsx`, `TaskFieldsCard.jsx`, `TaskReportCard.jsx` (1133 LOC, 9 hits)
- Detail panel: `TaskDetailPanel.jsx` (456 LOC, 4 hits)
- Slide-out: `CreateTaskSlideOut.jsx` (364 LOC, 4 hits)

**Created:** none.
**Deleted:** none.

**Branching:** Feature branch `feat/subplan-6b2-tasks-subcomponents-sweep` off main.

---

## Task 0: Setup — branch off main

**Files:** none.

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --rebase origin main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6b2-tasks-subcomponents-sweep`
Expected: `Switched to a new branch 'feat/subplan-6b2-tasks-subcomponents-sweep'`

- [ ] **Step 3: Verify baseline build/tests**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Capture baseline grep audit**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{TaskDetailPanel,TaskFieldsCard,TaskDescriptionCard,TaskReportCard,CreateTaskSlideOut,CancelTaskConfirmDialog,DeleteTaskConfirmDialog}.jsx \
  | wc -l
```
Expected: 21 hits across the 7 files. Note this number for the post-edit comparison in Task 5.

---

## Task 1: Sweep confirm dialogs

**Goal:** Apply the rule table to the 2 confirm dialogs. Both have a destructive-primary submit + a cancel — apply the destructive-emphasis rule.

**Files:**
- Modify: `src/components/tasks/CancelTaskConfirmDialog.jsx` (79 LOC, 2 hits)
- Modify: `src/components/tasks/DeleteTaskConfirmDialog.jsx` (91 LOC, 2 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/tasks/CancelTaskConfirmDialog.jsx
cat src/components/tasks/DeleteTaskConfirmDialog.jsx
```

- [ ] **Step 2: Apply the rules table**

Both files are confirm dialogs with the same shape:
- A modal overlay (`fixed inset-0` + backdrop) — **preserve as-is, do not migrate to `<Dialog>`**.
- A card surface — `bg-white dark:bg-slate-800` → `bg-card`, `border-slate-…` → `border-border`.
- A title + body text — `text-slate-{700-900}` → `text-foreground`, secondary text → `text-muted-foreground`.
- A cancel button (legacy ghost or `.btn-ghost`) → `<Button variant="ghost">`.
- A confirm/destructive button. **Identify whether it's a destructive primary (`bg-red-600 text-white`) or a destructive secondary (`.btn-danger-ghost` / `border-red-…` outline) by reading the original className.** Apply:
  - Destructive primary → `<Button variant="destructive">`.
  - Destructive secondary → `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

For both `CancelTaskConfirmDialog` and `DeleteTaskConfirmDialog`, the confirm button triggers the actual destructive RPC (`cancel_task` / `delete_task`). The original styling determines the variant; do NOT downgrade a primary to a ghost or vice versa.

- [ ] **Step 3: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 5: Verify per-file grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{CancelTaskConfirmDialog,DeleteTaskConfirmDialog}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Verify no unused imports**

Quickly scan the import list of each file. If `Button` was added but is not used in JSX (or the only `<Button>` is in conditional logic that's never rendered), remove it. Same for `Input` if not used. Same for any lucide icon (`AlertCircle`, etc.) added speculatively.

- [ ] **Step 7: Commit**

```bash
git add src/components/tasks/CancelTaskConfirmDialog.jsx \
        src/components/tasks/DeleteTaskConfirmDialog.jsx
git commit -m "feat(tasks): swap Tasks confirm dialogs to DS tokens

Subplan 6B2 task 1. Replace slate/indigo/red palette + raw <button> with DS tokens and shadcn primitives in the 2 confirm dialogs (CancelTaskConfirmDialog 2 hits, DeleteTaskConfirmDialog 2 hits = 4 hits total). Destructive-primary submits use <Button variant=\"destructive\">; cancel buttons use <Button variant=\"ghost\">. Hand-rolled overlays kept (Dialog migration is Subplan 6D)."
```

---

## Task 2: Sweep cards

**Goal:** Apply the rule table to the 3 task-card files (Description / Fields / Report).

**Files:**
- Modify: `src/components/tasks/TaskDescriptionCard.jsx` (114 LOC, 2 hits)
- Modify: `src/components/tasks/TaskFieldsCard.jsx` (296 LOC, 4 hits)
- Modify: `src/components/tasks/TaskReportCard.jsx` (723 LOC, 3 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/tasks/TaskDescriptionCard.jsx
cat src/components/tasks/TaskFieldsCard.jsx
cat src/components/tasks/TaskReportCard.jsx
```

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{TaskDescriptionCard,TaskFieldsCard,TaskReportCard}.jsx
```

You will see 9 lines total (2 + 4 + 3). For each, pinpoint the rule-table mapping and apply it.

- [ ] **Step 3: Apply the rules table**

For each card:
- Card-surface wrapper: `bg-white dark:bg-slate-800` → `bg-card`; `border-slate-…` → `border-border`.
- Headers/titles: `text-slate-{800,900} dark:…` → `text-foreground`.
- Auxiliary text: `text-slate-{400-600}` → `text-muted-foreground` (or `text-[var(--fg4)]` for very-low-contrast labels).
- Form fields (textarea, input, select): apply rules — raw `<input>` → shadcn `<Input>`; raw `<textarea>` keep native and DS-token the className (project has no `<Textarea>` primitive); native `<select>` keep with DS-tokenised className.
- Save / submit buttons: legacy CTA → `<Button>`; legacy ghost cancel → `<Button variant="ghost">`. Apply destructive-emphasis if any button is destructive.

`TaskReportCard` is the largest (723 LOC) but only 3 hits. Most of the file is photo-upload + report-form logic. Stay surgical: only touch the 3 hit lines (and possibly their immediate JSX neighbours that share the legacy palette).

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 6: Verify per-file grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{TaskDescriptionCard,TaskFieldsCard,TaskReportCard}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports** (quick scan of each file's import block).

- [ ] **Step 8: Commit**

```bash
git add src/components/tasks/TaskDescriptionCard.jsx \
        src/components/tasks/TaskFieldsCard.jsx \
        src/components/tasks/TaskReportCard.jsx
git commit -m "feat(tasks): swap Tasks detail-panel cards to DS tokens

Subplan 6B2 task 2. Replace slate/indigo/red palette + raw <button>/<input> with DS tokens and shadcn primitives in the 3 cards rendered inside TaskDetailPanel (TaskDescriptionCard 2 hits, TaskFieldsCard 4 hits, TaskReportCard 3 hits = 9 hits total). Behaviour preserved 1:1."
```

---

## Task 3: Sweep TaskDetailPanel

**Goal:** Apply the rule table to the panel wrapper (`TaskDetailPanel.jsx`).

**Files:**
- Modify: `src/components/tasks/TaskDetailPanel.jsx` (456 LOC, 4 hits)

- [ ] **Step 1: Read the file in full**

Run: `cat src/components/tasks/TaskDetailPanel.jsx`

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/TaskDetailPanel.jsx
```

You will see 4 lines.

- [ ] **Step 3: Apply the rules table**

`TaskDetailPanel` is a panel wrapper (header + tab nav + tab content render via children). Likely legacy hits are in:
- Header surface (`bg-white dark:bg-slate-800` → `bg-card` if not already DS).
- Header actions (cancel/delete buttons) — apply destructive-emphasis as needed.
- Tab nav (`border-indigo-…` for active state → `border-primary`; `text-slate-…` for inactive → `text-muted-foreground`).

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 6: Verify grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/TaskDetailPanel.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/tasks/TaskDetailPanel.jsx
git commit -m "feat(tasks): swap TaskDetailPanel wrapper to DS tokens

Subplan 6B2 task 3. Replace slate/indigo/red palette + raw <button> in the TaskDetailPanel wrapper (4 hits). Header surface, tab nav, and header actions converted to DS tokens and shadcn primitives. Behaviour preserved."
```

---

## Task 4: Sweep CreateTaskSlideOut

**Goal:** Apply the rule table to the slide-out form.

**Files:**
- Modify: `src/components/tasks/CreateTaskSlideOut.jsx` (364 LOC, 4 hits)

- [ ] **Step 1: Read the file in full**

Run: `cat src/components/tasks/CreateTaskSlideOut.jsx`

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/CreateTaskSlideOut.jsx
```

You will see 4 lines.

- [ ] **Step 3: Apply the rules table**

`CreateTaskSlideOut` is a slide-out form (`fixed inset-y-0 right-0` panel). **Do NOT migrate to shadcn `<Sheet>` — that is Subplan 6D.** Likely legacy hits are in:
- Form inputs (raw `<input>` → shadcn `<Input>`).
- Submit button (legacy CTA → `<Button>`).
- Cancel button (legacy ghost → `<Button variant="ghost">`).
- Possibly an error block (legacy red → `bg-[var(--danger-soft)]` + `text-[var(--danger-ink)]` + `role="alert"`).

`CreateTaskSlideOut.test.jsx` exists — verify it still passes after the swap (queries should be class-invariant since it queries by accessible name / label, but confirm).

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235. `CreateTaskSlideOut.test.jsx` must stay green.

- [ ] **Step 6: Verify grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/CreateTaskSlideOut.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/tasks/CreateTaskSlideOut.jsx
git commit -m "feat(tasks): swap CreateTaskSlideOut to DS tokens

Subplan 6B2 task 4. Replace slate/indigo/red palette + raw <button>/<input> in the task creation slide-out (4 hits). Hand-rolled fixed-position panel kept (Sheet migration is Subplan 6D). Behaviour preserved; CreateTaskSlideOut.test.jsx still green."
```

---

## Task 5: Final grep audit

**Goal:** Verify zero legacy classes remain across the 7 modified Tasks sub-component files.

**Files:** none (verification only).

- [ ] **Step 1: Run the canonical audit**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{TaskDetailPanel,TaskFieldsCard,TaskDescriptionCard,TaskReportCard,CreateTaskSlideOut,CancelTaskConfirmDialog,DeleteTaskConfirmDialog}.jsx \
  || echo "ALL CLEAN"
```
Expected: `ALL CLEAN`.

- [ ] **Step 2: Verify out-of-scope files still clean (regression check)**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/tasks/{AssigneeSelector,TaskActivityCard,TaskBoxTabs}.jsx \
  || echo "clean"
```
Expected: `clean` (these were already DS-clean and we didn't touch them).

- [ ] **Step 3: Final build + tests + lint**

Run: `npm run build`
Expected: clean.

Run: `npm test -- --run`
Expected: 235/235.

Run: `npm run lint 2>&1 | grep -E "components/tasks/(TaskDetailPanel|TaskFieldsCard|TaskDescriptionCard|TaskReportCard|CreateTaskSlideOut|CancelTaskConfirmDialog|DeleteTaskConfirmDialog)" | head -20`
Expected: no output (no new lint warnings in modified files; pre-existing repo-wide warnings are acceptable).

- [ ] **Step 4: No commit (verification only)**

If any issue is found, fix in the affected file and append a follow-up commit before the PR.

---

## Task 6: Push branch + create PR

**Files:** none (git/gh).

The current `temashdesign` GitHub account lacks push permission to `clubmonaco2017-ops/operator-dashboard`. Switch to `clubmonaco2017-ops` for the push (per project memory `project_gh_auth.md`), then switch back after.

- [ ] **Step 1: Switch to push-capable GitHub user**

Run: `gh auth switch --user clubmonaco2017-ops`
Expected: `✓ Switched active account for github.com to clubmonaco2017-ops`

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/subplan-6b2-tasks-subcomponents-sweep`
Expected: branch pushed, tracking set up.

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create --title "feat(tasks): Subplan 6B2 — Tasks sub-components DS sweep" --body "$(cat <<'EOF'
## Summary
- Family C second sweep — pure DS-token + shadcn-primitive swap of 7 Tasks sub-component files (1 detail panel + 3 cards + 1 slide-out + 2 confirm dialogs, ~2123 LOC).
- 4 commits across 4 logical task groups (confirm dialogs / cards / detail panel / slide-out).
- Every legacy slate-/indigo-/red-/.btn-* class replaced (21 hits → 0; verified via tightened grep).
- Raw <button>/<input>/inline-SVG → shadcn <Button>/<Input>/lucide icons.
- Destructive-emphasis rule honoured: destructive primaries → <Button variant="destructive">; secondaries → ghost+danger className.

## Out of scope
- shadcn <Dialog> / <Sheet> migration for hand-rolled modal overlays + slide-out — separate future Subplan 6D.
- AssigneeSelector / TaskActivityCard / TaskBoxTabs — verified DS-clean already (untouched).
- Master-layer files (TaskList / TaskListItem / EmptyZero / EmptyFilter / DetailEmptyHint / TaskFilterChips) — already swept in 6A5.
- .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css — Subplan 6C after 6B2-6B4 land.

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green (no new tests; CreateTaskSlideOut.test.jsx covers the only test-covered file in this set)
- [x] Final grep audit (tightened regex): zero hits across the 7 modified files
- [x] DS-clean files (AssigneeSelector / TaskActivityCard / TaskBoxTabs) untouched
- [x] Spec compliance + code quality review per task

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6b2-tasks-subcomponents-sweep.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 4: Switch GitHub user back**

Run: `gh auth switch --user temashdesign`
Expected: `✓ Switched active account for github.com to temashdesign`.

- [ ] **Step 5: Update DS rollout roadmap memory after merge**

After PR merges, update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`:
- Add `- 6B2 (Tasks sub-components DS sweep): 7 files, ~2123 LOC, 21 legacy hits → 0; modals/slide-out stayed div-overlays (6D)` to the Done list.
- Mark «Family C» 6B2 as done in queue; remaining 6B3 (Teams), 6B4 (Clients).

---

## Self-review

**Spec coverage:**
- §1 in-scope (7 files listed by name and tier): each has a task assignment in Tasks 1-4 ✓.
- §1 rules table: reproduced verbatim at the top of this plan, plus the destructive-emphasis rule ✓.
- §1 out-of-scope (Dialog/Sheet migration, photo-upload UX, structural refactor, .btn-* CSS cleanup): excluded in plan's «What NOT to do» block ✓.
- §3 behaviour contracts preserved: enforced by «What NOT to do» + per-task tests ✓.
- §4 acceptance criteria: build clean (per-task + Task 5), tests 235/235 (per-task + Task 5), grep audit clean (per-task + Task 5), lint clean (Task 5) ✓.
- §5 implementation order: tasks match (Task 1 = confirm dialogs / Task 2 = cards / Task 3 = detail panel / Task 4 = slide-out) ✓.

**Placeholder scan:** no TBD/TODO/«implement later». Each step shows full code or full command. The rules table is concrete and exhaustive.

**Type consistency:** no new symbols introduced. Imports are consistent with the project: `@/components/ui/button`, `@/components/ui/input`, `lucide-react`. Lucide icon names (`AlertCircle`, `Loader2`, `Info`, `Check`) match actual lucide-react exports.

**Note on TDD discipline:** This subplan follows the «class-only swap, behaviour invariant» pattern from 6B1. No new tests; existing `CreateTaskSlideOut.test.jsx` is the only test that touches this set, and it queries by accessible name/label so it should stay green under class-only changes.
