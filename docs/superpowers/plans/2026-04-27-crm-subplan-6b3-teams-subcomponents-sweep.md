# CRM Subplan 6B3 — Teams sub-components DS sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token + shadcn-`<Button>` swap across 8 Teams sub-components (3 tabs + 1 slide-out + 3 modals + 1 confirm dialog, ~1641 LOC, 17 legacy hits) with no behaviour or structural changes.

**Architecture:** Mechanical class-replacement work driven by the same rule table that powered Subplans 6B1 and 6B2. Tasks group files by tier (confirm dialog / tabs / slide-out / modals). Within each task, the implementer reads each file, applies the rule table, replaces raw `<button>`/`<input>` with shadcn primitives, and verifies build/tests stay green.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>` / `<Input>` + lucide-react. No new tests (presentational; existing `CreateTeamSlideOut.test.jsx` covers the only test-touched file in this set).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6b3-teams-subcomponents-sweep-design.md`](../specs/2026-04-27-crm-subplan-6b3-teams-subcomponents-sweep-design.md)

**Reference patterns:**
- Subplan 6B1 (PR #30) and Subplan 6B2 (PR #31) — the canonical Family C sweeps; same rules table reused here.
- Post-6B1: `src/components/staff/DeleteRequestModal.jsx` — destructive primary `<Button variant="destructive">` + cancel `<Button variant="ghost">`.
- Post-6B2: `src/components/tasks/TaskDetailPanel.jsx` — `.btn-danger-ghost` → `<Button variant="ghost">` + danger className for destructive secondary.

---

## Rules table (apply uniformly to every file in this subplan)

Identical to 6B1/6B2 rules. Reproduced verbatim so the implementer has a single source of truth.

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
| `border-indigo-{500,600}` (active tab underline) | `border-primary` |
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

**Preserve destructive emphasis:** When the legacy code distinguishes a destructive primary (`bg-red-600 text-white`) from a destructive secondary (`.btn-danger-ghost` or `border-red-…` outline), preserve that distinction. The button that triggers the actual destructive RPC is the destructive one — even if labelled «Подтвердить» or «Архивировать» rather than «Удалить».

**What NOT to do:**

- Do NOT change `useState`, `useEffect`, RPC call signatures, prop names, conditional render structure, JSX tree shape, or any handler logic. Pure visual change.
- Do NOT migrate hand-rolled `fixed inset-0` modal overlays / hand-rolled slide-outs to shadcn `<Dialog>` / `<Sheet>`. That is Subplan 6D.
- Do NOT remove `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions from `src/index.css`. That is Subplan 6C.
- Do NOT touch any file beyond the 8 listed.
- Do NOT touch `TeamDetailPanel.jsx` or `ReadOnlyBadge.jsx` (verified DS-clean already), or any master-layer file (`TeamList`, `TeamListItem`, etc., already swept in 6A7).
- Do NOT add unused imports. Use the `@/components/ui/button` alias (not `'../ui/button.jsx'` — see 6B2 follow-up).

---

## File Structure

**Modified (8):**
- Confirm dialog: `ArchiveTeamConfirmDialog.jsx` (73 LOC, 2 hits)
- Tabs: `TeamMembersTab.jsx`, `TeamClientsTab.jsx`, `TeamActivityTab.jsx` (612 LOC, 7 hits)
- Slide-out: `CreateTeamSlideOut.jsx` (299 LOC, 2 hits)
- Modals: `AddMemberModal.jsx`, `AddClientsModal.jsx`, `ChangeLeadModal.jsx` (657 LOC, 6 hits)

**Created:** none.
**Deleted:** none.

**Branching:** Feature branch `feat/subplan-6b3-teams-subcomponents-sweep` off main.

---

## Task 0: Setup — branch off main

**Files:** none.

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --rebase origin main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6b3-teams-subcomponents-sweep`
Expected: `Switched to a new branch 'feat/subplan-6b3-teams-subcomponents-sweep'`

- [ ] **Step 3: Verify baseline build/tests**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Capture baseline grep audit**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/{TeamMembersTab,TeamClientsTab,TeamActivityTab,CreateTeamSlideOut,AddMemberModal,AddClientsModal,ChangeLeadModal,ArchiveTeamConfirmDialog}.jsx \
  | wc -l
```
Expected: 17 hits across the 8 files. Note this number for the post-edit comparison in Task 5.

---

## Task 1: Sweep ArchiveTeamConfirmDialog

**Goal:** Apply the rule table to the single confirm dialog. Honour destructive-emphasis rule for the submit button.

**Files:**
- Modify: `src/components/teams/ArchiveTeamConfirmDialog.jsx` (73 LOC, 2 hits)

- [ ] **Step 1: Read the file in full**

Run: `cat src/components/teams/ArchiveTeamConfirmDialog.jsx`

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/ArchiveTeamConfirmDialog.jsx
```

You will see 2 lines.

- [ ] **Step 3: Apply the rules table**

This is a confirm dialog for archiving a team:
- Modal overlay (`fixed inset-0` + backdrop) — **preserve as-is**.
- Card surface, title, body — apply DS-token swaps per rules table.
- Cancel button (legacy ghost or `.btn-ghost`) → `<Button variant="ghost">` (no danger).
- Confirm/archive button — read original styling. **Archive is the destructive RPC.** If `bg-red-600 text-white` → `<Button variant="destructive">`; if `.btn-danger-ghost` → `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`. Preserve original variant.

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
  src/components/teams/ArchiveTeamConfirmDialog.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/teams/ArchiveTeamConfirmDialog.jsx
git commit -m "feat(teams): swap ArchiveTeamConfirmDialog to DS tokens

Subplan 6B3 task 1. Replace slate/indigo/red palette + raw <button> with DS tokens and shadcn primitives in the single confirm dialog (2 hits). Archive submit honours destructive-emphasis rule from the original styling. Hand-rolled overlay kept (Dialog migration is Subplan 6D)."
```

---

## Task 2: Sweep tabs

**Goal:** Apply the rule table to the 3 detail-tab files.

**Files:**
- Modify: `src/components/teams/TeamMembersTab.jsx` (218 LOC, 3 hits)
- Modify: `src/components/teams/TeamClientsTab.jsx` (185 LOC, 3 hits)
- Modify: `src/components/teams/TeamActivityTab.jsx` (209 LOC, 1 hit)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/teams/TeamMembersTab.jsx
cat src/components/teams/TeamClientsTab.jsx
cat src/components/teams/TeamActivityTab.jsx
```

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/{TeamMembersTab,TeamClientsTab,TeamActivityTab}.jsx
```

You will see 7 lines total (3 + 3 + 1).

- [ ] **Step 3: Apply the rules table**

Tabs likely contain:
- Card surface wrapper (`bg-white dark:bg-slate-800` → `bg-card`).
- List rows of members/clients with action buttons. **Watch for destructive secondary buttons** — «Снять с команды» (remove member), «Снять клиента» (unassign client) — these are typical destructive secondaries (`.btn-danger-ghost` or `border-red-…` outline). Apply the destructive-secondary mapping.
- «Добавить участника» / «Добавить клиента» CTA buttons — non-destructive primary → `<Button>` default.
- Empty/loading state text colour swaps (`text-slate-500` → `text-muted-foreground`).

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
  src/components/teams/{TeamMembersTab,TeamClientsTab,TeamActivityTab}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/teams/TeamMembersTab.jsx \
        src/components/teams/TeamClientsTab.jsx \
        src/components/teams/TeamActivityTab.jsx
git commit -m "feat(teams): swap Teams detail tabs to DS tokens

Subplan 6B3 task 2. Replace slate/indigo/red palette + raw <button>/<input> with DS tokens and shadcn primitives in the 3 detail-tab components (TeamMembersTab 3 hits, TeamClientsTab 3 hits, TeamActivityTab 1 hit = 7 hits total). Behaviour preserved 1:1."
```

---

## Task 3: Sweep CreateTeamSlideOut

**Goal:** Apply the rule table to the slide-out form.

**Files:**
- Modify: `src/components/teams/CreateTeamSlideOut.jsx` (299 LOC, 2 hits)

- [ ] **Step 1: Read the file in full**

Run: `cat src/components/teams/CreateTeamSlideOut.jsx`

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/CreateTeamSlideOut.jsx
```

You will see 2 lines (most likely the footer cancel + submit pair).

- [ ] **Step 3: Apply the rules table**

`CreateTeamSlideOut` is the slide-out form for creating a team. **Do NOT migrate to shadcn `<Sheet>` — that is Subplan 6D.** Apply rules:
- Cancel button (legacy ghost / `.btn-ghost`) → `<Button variant="ghost">`.
- Submit button (legacy `.btn-primary` / `bg-indigo-600`) → `<Button>` default.

`CreateTeamSlideOut.test.jsx` queries by accessible name/label and should be class-invariant — confirm tests stay green after the swap.

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235. `CreateTeamSlideOut.test.jsx` must stay green.

- [ ] **Step 6: Verify grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/CreateTeamSlideOut.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/teams/CreateTeamSlideOut.jsx
git commit -m "feat(teams): swap CreateTeamSlideOut to DS tokens

Subplan 6B3 task 3. Replace slate/indigo/red palette + raw <button>/<input> in the team creation slide-out (2 hits). Hand-rolled fixed-position panel kept (Sheet migration is Subplan 6D). Behaviour preserved; CreateTeamSlideOut.test.jsx still green."
```

---

## Task 4: Sweep modals

**Goal:** Apply the rule table to the 3 member/client/lead modals.

**Files:**
- Modify: `src/components/teams/AddMemberModal.jsx` (197 LOC, 2 hits)
- Modify: `src/components/teams/AddClientsModal.jsx` (229 LOC, 2 hits)
- Modify: `src/components/teams/ChangeLeadModal.jsx` (231 LOC, 2 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/teams/AddMemberModal.jsx
cat src/components/teams/AddClientsModal.jsx
cat src/components/teams/ChangeLeadModal.jsx
```

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/{AddMemberModal,AddClientsModal,ChangeLeadModal}.jsx
```

You will see 6 lines total (2 + 2 + 2).

- [ ] **Step 3: Apply the rules table**

Each modal is a hand-rolled overlay with a card containing a list selector + cancel/submit footer. None of these RPC actions are destructive (add member, add clients, change lead are workflow actions). Apply rules:
- Cancel button → `<Button variant="ghost">`.
- Submit button → `<Button>` default.
- If a search input or list scroll container has legacy classes, apply rules table.

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
  src/components/teams/{AddMemberModal,AddClientsModal,ChangeLeadModal}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/teams/AddMemberModal.jsx \
        src/components/teams/AddClientsModal.jsx \
        src/components/teams/ChangeLeadModal.jsx
git commit -m "feat(teams): swap Teams selection modals to DS tokens

Subplan 6B3 task 4. Replace slate/indigo/red palette + raw <button>/<input> in the 3 selection modals (AddMemberModal 2 hits, AddClientsModal 2 hits, ChangeLeadModal 2 hits = 6 hits total). Modals kept as fixed-overlay div components — Dialog migration is Subplan 6D. Behaviour preserved."
```

---

## Task 5: Final grep audit

**Goal:** Verify zero legacy classes remain across the 8 modified Teams sub-component files.

**Files:** none (verification only).

- [ ] **Step 1: Run the canonical audit**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/{TeamMembersTab,TeamClientsTab,TeamActivityTab,CreateTeamSlideOut,AddMemberModal,AddClientsModal,ChangeLeadModal,ArchiveTeamConfirmDialog}.jsx \
  || echo "ALL CLEAN"
```
Expected: `ALL CLEAN`.

- [ ] **Step 2: Verify out-of-scope files still clean (regression check)**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/teams/{TeamDetailPanel,ReadOnlyBadge}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 3: Final build + tests + lint**

Run: `npm run build`
Expected: clean.

Run: `npm test -- --run`
Expected: 235/235.

Run: `npm run lint 2>&1 | grep -E "components/teams/(TeamMembersTab|TeamClientsTab|TeamActivityTab|CreateTeamSlideOut|AddMemberModal|AddClientsModal|ChangeLeadModal|ArchiveTeamConfirmDialog)" | head -20`
Expected: no output (no new lint warnings in modified files).

- [ ] **Step 4: No commit (verification only)**

If any issue is found, fix in the affected file and append a follow-up commit before the PR.

---

## Task 6: Push branch + create PR

**Files:** none (git/gh).

- [ ] **Step 1: Switch to push-capable GitHub user**

Run: `gh auth switch --user clubmonaco2017-ops`
Expected: `✓ Switched active account for github.com to clubmonaco2017-ops`

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/subplan-6b3-teams-subcomponents-sweep`
Expected: branch pushed, tracking set up.

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create --title "feat(teams): Subplan 6B3 — Teams sub-components DS sweep" --body "$(cat <<'EOF'
## Summary
- Family C third sweep — pure DS-token + shadcn-primitive swap of 8 Teams sub-component files (3 tabs + 1 slide-out + 3 modals + 1 confirm dialog, ~1641 LOC).
- 4 commits across 4 logical task groups (confirm dialog / tabs / slide-out / modals).
- Every legacy slate-/indigo-/red-/.btn-* class replaced (17 hits → 0; verified via tightened grep).
- Raw <button> → shadcn <Button> per CTA / secondary / destructive distinction.
- Destructive-emphasis rule honoured: ArchiveTeamConfirmDialog submit + any inline destructive secondaries inside tabs map per original styling.

## Out of scope
- shadcn <Dialog> / <Sheet> migration for hand-rolled modal overlays + slide-out — separate future Subplan 6D.
- TeamDetailPanel / ReadOnlyBadge — verified DS-clean already (untouched).
- Master-layer files (TeamList / TeamListItem / EmptyZero / EmptyFilter / DetailEmptyHint / TeamFilterChips) — already swept in 6A7.
- .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css — Subplan 6C after 6B4 lands.

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green (no new tests; CreateTeamSlideOut.test.jsx covers the only test-touched file in this set)
- [x] Final grep audit (tightened regex): zero hits across the 8 modified files
- [x] DS-clean files (TeamDetailPanel / ReadOnlyBadge) untouched
- [x] Spec compliance + code quality review per task

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6b3-teams-subcomponents-sweep-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6b3-teams-subcomponents-sweep.md

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
- Add `- 6B3 (Teams sub-components DS sweep): 8 files, ~1641 LOC, 17 legacy hits → 0; modals/slide-out stayed div-overlays (6D)` to the Done list.
- Mark «Family C» 6B3 as done; remaining 6B4 (Clients).

---

## Self-review

**Spec coverage:**
- §1 in-scope (8 files listed by name and tier): each has a task assignment in Tasks 1-4 ✓.
- §1 rules table: reproduced verbatim at the top, plus destructive-emphasis rule ✓.
- §1 out-of-scope (Dialog/Sheet migration, structural refactor, .btn-* CSS cleanup): excluded in plan's «What NOT to do» block ✓.
- §3 behaviour contracts preserved: enforced by «What NOT to do» + per-task tests ✓.
- §4 acceptance criteria: build clean (per-task + Task 5), tests 235/235, grep audit clean (per-task + Task 5), lint clean (Task 5) ✓.
- §5 implementation order: tasks match (Task 1 = confirm dialog / Task 2 = tabs / Task 3 = slide-out / Task 4 = modals) ✓.

**Placeholder scan:** no TBD/TODO/«implement later». Each step shows full code or full command. The rules table is concrete and exhaustive.

**Type consistency:** no new symbols introduced. Imports use `@/components/ui/button` alias (the convention reaffirmed in 6B2 follow-up). Lucide icon names match actual exports.
