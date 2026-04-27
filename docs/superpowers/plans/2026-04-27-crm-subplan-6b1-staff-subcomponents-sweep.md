# CRM Subplan 6B1 — Staff sub-components DS sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token + shadcn-`<Button>` swap across 14 Staff sub-components (4 tabs + 6 modals + 4 utility blocks, ~1546 LOC, ~63 legacy hits) with no behaviour or structural changes.

**Architecture:** Mechanical class-replacement work driven by a single rule table (§Rules below). Each task targets a small group of related files; within each task, the implementer reads each file, applies the rule table, replaces raw `<button>`/`<input>` with shadcn primitives where applicable, and verifies build/tests stay green.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>` / `<Input>` + lucide-react. No new tests (presentational; existing `PermissionsTab.test.jsx` covers the only directly-tested file).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md`](../specs/2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md)

**Reference patterns:**
- `src/pages/NotificationsPage.jsx` (post-6A9) and `src/LoginPage.jsx` (post-6A10) — the «before/after» for a typical full-file repaint, including the `var(--danger-soft)` / `var(--danger-ink)` / `var(--danger-strong)` block + lucide `<AlertCircle>` pattern for error blocks.
- `src/components/staff/CreateStaffSlideOut.jsx` (post-6A8) — the `var(--primary-ring)` focus pattern for inputs and the `bg-primary text-primary-foreground` button pattern.

---

## Rules table (apply uniformly to every file in this subplan)

| Legacy class / element | DS replacement |
|---|---|
| `text-slate-{700,800,900} dark:text-slate-{100,200,300}` | `text-foreground` |
| `text-slate-{400,500,600} dark:text-slate-{400,500}` | `text-muted-foreground` |
| `bg-white dark:bg-slate-800` (card surface) | `bg-card` |
| `border-slate-{200,300} dark:border-slate-{600,700}` (card or input border) | `border-border` |
| `border-slate-{300} dark:border-slate-{600}` (form-input border specifically) | `border-input` |
| `bg-slate-100 dark:bg-slate-{800,900}` (subtle surface, e.g. ref-code chip background) | `bg-muted` |
| `bg-indigo-600 hover:bg-indigo-700 text-white` (CTA button) | shadcn `<Button>` (default variant) |
| `text-indigo-{600,800} bg-indigo-{50,100}` (highlight chip) | `text-primary bg-primary/10` |
| `bg-red-{50,100} dark:bg-red-900/20` (danger surface) | `bg-[var(--danger-soft)]` |
| `text-red-{500,600,700} dark:text-red-{300,400}` (danger text) | `text-[var(--danger-ink)]` |
| `border-red-{200,800}` (danger border) | `border-[var(--danger-strong)]` |
| `focus:ring-indigo-{400,500}` | `focus:ring-[var(--primary-ring)]` (or remove if using shadcn `<Input>`/`<Button>` which set their own focus styles) |
| `placeholder-slate-400` | `placeholder:text-[var(--fg4)]` |
| Raw `<button className="bg-indigo-600 …">` (CTA) | `<Button onClick={…}>label</Button>` |
| Raw `<button className="rounded-lg border border-slate-200 …">` (secondary) | `<Button variant="ghost" onClick={…}>label</Button>` (or `<Button variant="outline">` if border treatment is desired) |
| Raw `<button className="bg-red-…">` or `<button className="border-red-… text-red-…">` (destructive) | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">label</Button>` |
| `.btn-primary` utility | `<Button>` default variant |
| `.btn-ghost` utility | `<Button variant="ghost">` |
| `.btn-danger-ghost` utility | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| Raw `<input>` with custom slate/indigo styling | shadcn `<Input>` — drop the className entirely (shadcn `<Input>` already styles itself) |
| Raw `<select>` (small static option set, ≤ 6 options) | shadcn `<Select>` (only if it's a clean win — otherwise keep native `<select>` and apply DS tokens to its className) |
| Raw `<select>` (dynamic / large list, e.g. 50 staff members) | keep native `<select>` styled with DS tokens |
| Inline SVG warning/info/check icon | lucide `<AlertCircle>` / `<Info>` / `<Check>` (project convention) |
| Hand-rolled inline spinner SVG | lucide `<Loader2 className="animate-spin">` |

**What NOT to do:**

- Do NOT change `useState`, `useEffect`, RPC call signatures, prop names, conditional render structure, JSX tree shape, or any handler logic. Pure visual change.
- Do NOT migrate hand-rolled `fixed inset-0` modal overlays to shadcn `<Dialog>`. That is Subplan 6D.
- Do NOT touch `StaffListItem.jsx` or `StaffDetailPanel.jsx` — they own the documented 5-color role-badge DS-exception.
- Do NOT remove `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions from `src/index.css`. That happens in Subplan 6C after 6B1-6B4 land.

**Worked example — `RefCodePreview.jsx` (smallest file, full before/after):**

Before:
```jsx
import { roleToPrefix } from '../../lib/refCode.js'

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1).toLocaleLowerCase('ru-RU')
}

export function RefCodePreview({ role, firstName, lastName }) {
  let prefix
  try {
    prefix = roleToPrefix(role)
  } catch {
    return <span className="font-mono text-sm text-slate-400">—</span>
  }
  const first = firstName ? capitalize(firstName) : '…'
  const last = lastName ? lastName.charAt(0).toLocaleUpperCase('ru-RU') : ''
  const body = firstName || lastName ? `${first}${last}` : '…'
  return (
    <span className="font-mono text-sm text-slate-600 dark:text-slate-300">
      {prefix}-{body}-###
    </span>
  )
}
```

After:
```jsx
import { roleToPrefix } from '../../lib/refCode.js'

function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('ru-RU') + s.slice(1).toLocaleLowerCase('ru-RU')
}

export function RefCodePreview({ role, firstName, lastName }) {
  let prefix
  try {
    prefix = roleToPrefix(role)
  } catch {
    return <span className="font-mono text-sm text-muted-foreground">—</span>
  }
  const first = firstName ? capitalize(firstName) : '…'
  const last = lastName ? lastName.charAt(0).toLocaleUpperCase('ru-RU') : ''
  const body = firstName || lastName ? `${first}${last}` : '…'
  return (
    <span className="font-mono text-sm text-muted-foreground">
      {prefix}-{body}-###
    </span>
  )
}
```

Diff: 2 lines changed. `text-slate-400` and `text-slate-600 dark:text-slate-300` both collapse to `text-muted-foreground` (one is the «empty» fallback, the other is the populated value — both are subtitle-class text). No structural change.

---

## File Structure

**Modified (14):**
- Tabs: `ProfileTab.jsx`, `AttributesTab.jsx`, `PermissionsTab.jsx`, `ActivityTab.jsx` (4 files, 263 LOC)
- Modals: `ChangePasswordModal.jsx`, `DeleteRequestModal.jsx`, `ApprovalReviewModal.jsx`, `ChangeTeamModal.jsx`, `AddCuratedOperatorsModal.jsx`, `ChangeCuratorModal.jsx` (6 files, 899 LOC)
- Utility blocks: `CuratorBlock.jsx`, `CuratedOperatorsBlock.jsx`, `TeamMembershipBlock.jsx`, `RefCodePreview.jsx` (4 files, 384 LOC)

**Created:** none.
**Deleted:** none.

**Branching:** Feature branch `feat/subplan-6b1-staff-subcomponents-sweep` off main.

---

## Task 0: Setup — branch off main

**Files:** none.

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --rebase origin main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6b1-staff-subcomponents-sweep`
Expected: `Switched to a new branch 'feat/subplan-6b1-staff-subcomponents-sweep'`

- [ ] **Step 3: Verify baseline build/tests**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Capture baseline grep audit (record total hits before edits)**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{ProfileTab,AttributesTab,PermissionsTab,ActivityTab,ChangePasswordModal,DeleteRequestModal,ApprovalReviewModal,ChangeTeamModal,AddCuratedOperatorsModal,ChangeCuratorModal,CuratorBlock,CuratedOperatorsBlock,TeamMembershipBlock,RefCodePreview}.jsx | wc -l
```
Expected: ≈ 60-70 hits. Note this count for the post-edit comparison in Task 6.

---

## Task 1: Sweep small high-hit files (quick wins)

**Goal:** Apply the rule table to 4 files that are small (≤ 90 LOC) but have a high density of legacy hits.

**Files:**
- Modify: `src/components/staff/ChangePasswordModal.jsx` (81 LOC, 10 hits)
- Modify: `src/components/staff/ApprovalReviewModal.jsx` (58 LOC, 11 hits)
- Modify: `src/components/staff/DeleteRequestModal.jsx` (42 LOC, 5 hits)
- Modify: `src/components/staff/RefCodePreview.jsx` (23 LOC, 2 hits — see worked example above)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/staff/ChangePasswordModal.jsx
cat src/components/staff/ApprovalReviewModal.jsx
cat src/components/staff/DeleteRequestModal.jsx
cat src/components/staff/RefCodePreview.jsx
```

For each: identify every `slate-*`, `indigo-*`, `bg-red-*`, `text-red-*`, `border-red-*`, `.btn-primary`, `.btn-ghost`, `.btn-danger-ghost` token; identify every raw `<button>` with one of those classes; identify any inline warning/spinner SVG.

- [ ] **Step 2: Apply the rules table to each file**

For each file, apply every rule from the rules table at the top of this plan:
- Substitute legacy text/bg/border classes with their DS-token equivalents.
- Replace raw `<button>` CTAs with `<Button>` (import from `@/components/ui/button`).
- Replace raw `<input>` form controls with `<Input>` (import from `@/components/ui/input`) — drop bespoke className.
- Replace inline warning/spinner SVGs with lucide icons (import additions from `lucide-react`: `AlertCircle` / `Loader2` / `Info` / `Check` as needed).
- Add `role="alert"` on any error block that doesn't already have it (most don't).

For `ApprovalReviewModal.jsx` specifically: it has both an "approve" and a "decline" action. The approve goes to `<Button>` default variant. The decline goes to `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

For `DeleteRequestModal.jsx`: the submit button is a destructive action — same `variant="ghost"` + danger className treatment.

- [ ] **Step 3: Verify build clean**

Run: `npm run build`
Expected: clean. If it fails, check for missing imports (`Button`, `Input`, lucide icons) or typos in DS-token class names.

- [ ] **Step 4: Verify tests still pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 5: Verify per-file grep is clean**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{ChangePasswordModal,ApprovalReviewModal,DeleteRequestModal,RefCodePreview}.jsx || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/components/staff/ChangePasswordModal.jsx \
        src/components/staff/ApprovalReviewModal.jsx \
        src/components/staff/DeleteRequestModal.jsx \
        src/components/staff/RefCodePreview.jsx
git commit -m "feat(staff): swap small Staff modals + RefCodePreview to DS tokens

Subplan 6B1 task 1. Replace slate/indigo/red palette + raw <button>/<input> with DS tokens and shadcn primitives in 4 small high-hit files (ChangePasswordModal 10 hits, ApprovalReviewModal 11 hits, DeleteRequestModal 5 hits, RefCodePreview 2 hits = 28 hits total). Behaviour preserved 1:1. Hand-rolled modal overlays kept (Dialog migration is Subplan 6D)."
```

---

## Task 2: Sweep tab files

**Goal:** Apply the rule table to the 4 detail-tab files.

**Files:**
- Modify: `src/components/staff/ProfileTab.jsx` (112 LOC, 7 hits)
- Modify: `src/components/staff/AttributesTab.jsx` (87 LOC, 9 hits)
- Modify: `src/components/staff/PermissionsTab.jsx` (54 LOC, 4 hits)
- Modify: `src/components/staff/ActivityTab.jsx` (10 LOC, 3 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/staff/ProfileTab.jsx
cat src/components/staff/AttributesTab.jsx
cat src/components/staff/PermissionsTab.jsx
cat src/components/staff/ActivityTab.jsx
```

- [ ] **Step 2: Apply the rules table to each file**

`ProfileTab.jsx`:
- The «Сохранить» button uses `.btn-primary` style → swap to `<Button>`.
- The cancel/reset button uses ghost-style → swap to `<Button variant="ghost">`.
- Email/firstName/lastName text inputs → `<Input>`.

`AttributesTab.jsx`:
- The shift `<select>` (3 options: ДЕНЬ/ВЕЧЕР/НОЧЬ) — small static set, **swap to shadcn `<Select>`** if it's a clean drop-in; otherwise leave native and DS-token the className.
- The panel-id `<input>` → `<Input>`.
- Save button → `<Button>`.

`PermissionsTab.jsx`: the only legacy bits are inside the rendered `<div>` wrapper (`bg-white dark:bg-slate-800 border-slate-200 …`) and the checkbox styling (`text-indigo-600 focus:ring-indigo-500`). Swap the wrapper to `bg-card border-border`, swap checkbox `text-indigo-600` to `text-primary` and `focus:ring-indigo-500` to `focus:ring-[var(--primary-ring)]`. Group-header text colour → `text-[var(--fg4)]` (it's the `text-slate-400` uppercase «АДМИНИСТРИРОВАНИЕ» heading, which is auxiliary text).

`ActivityTab.jsx`: the wrapper `<div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">` becomes `<div className="rounded-lg border border-border bg-card p-8 text-center">`. The two `<p>` elements with `text-slate-500` / `text-slate-400` become `text-muted-foreground` / `text-[var(--fg4)]`. That's it — 10 LOC file.

- [ ] **Step 3: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Verify tests still pass**

Run: `npm test -- --run`
Expected: 235/235. `PermissionsTab.test.jsx` exercises `PermissionsTab` directly — make sure it still passes (the test queries by aria-label, not by classes, so token swap doesn't affect it).

- [ ] **Step 5: Verify per-file grep is clean**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{ProfileTab,AttributesTab,PermissionsTab,ActivityTab}.jsx || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/components/staff/ProfileTab.jsx \
        src/components/staff/AttributesTab.jsx \
        src/components/staff/PermissionsTab.jsx \
        src/components/staff/ActivityTab.jsx
git commit -m "feat(staff): swap Staff detail tabs to DS tokens

Subplan 6B1 task 2. Replace slate/indigo palette + raw <button>/<input> with DS tokens and shadcn primitives in the 4 detail-tab components (ProfileTab 7 hits, AttributesTab 9 hits, PermissionsTab 4 hits, ActivityTab 3 hits = 23 hits total). Behaviour preserved; PermissionsTab.test.jsx still green."
```

---

## Task 3: Sweep utility-block files

**Goal:** Apply the rule table to the 3 remaining utility-block files (RefCodePreview already done in Task 1).

**Files:**
- Modify: `src/components/staff/CuratorBlock.jsx` (89 LOC, 1 hit)
- Modify: `src/components/staff/CuratedOperatorsBlock.jsx` (187 LOC, 3 hits)
- Modify: `src/components/staff/TeamMembershipBlock.jsx` (85 LOC, 1 hit)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/staff/CuratorBlock.jsx
cat src/components/staff/CuratedOperatorsBlock.jsx
cat src/components/staff/TeamMembershipBlock.jsx
```

- [ ] **Step 2: Apply the rules table to each file**

These are mostly low-hit, mostly DS-clean already. Each has 1-3 specific legacy classes. Apply the rules table mechanically. Pay attention to:
- Buttons that open child modals: keep `onClick` handlers identical, only swap visual treatment.
- Empty/loading states: text colour swaps (`text-slate-500` → `text-muted-foreground`).
- Container wrappers (`bg-white dark:bg-slate-800`) → `bg-card`.

- [ ] **Step 3: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Verify tests still pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 5: Verify per-file grep is clean**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{CuratorBlock,CuratedOperatorsBlock,TeamMembershipBlock}.jsx || echo "clean"
```
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/components/staff/CuratorBlock.jsx \
        src/components/staff/CuratedOperatorsBlock.jsx \
        src/components/staff/TeamMembershipBlock.jsx
git commit -m "feat(staff): swap Staff ProfileTab utility blocks to DS tokens

Subplan 6B1 task 3. Replace remaining slate/indigo classes in the 3 utility-block components (CuratorBlock 1 hit, CuratedOperatorsBlock 3 hits, TeamMembershipBlock 1 hit = 5 hits total). Behaviour preserved."
```

---

## Task 4: Sweep large modal files

**Goal:** Apply the rule table to the 3 larger modals. These have low hit counts (only 2-3 legacy classes each) but high LOC because of complex member-selection UI; most of the file is logic, not styling.

**Files:**
- Modify: `src/components/staff/ChangeTeamModal.jsx` (201 LOC, 2 hits)
- Modify: `src/components/staff/AddCuratedOperatorsModal.jsx` (288 LOC, 3 hits)
- Modify: `src/components/staff/ChangeCuratorModal.jsx` (229 LOC, 2 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/staff/ChangeTeamModal.jsx
cat src/components/staff/AddCuratedOperatorsModal.jsx
cat src/components/staff/ChangeCuratorModal.jsx
```

- [ ] **Step 2: Locate the legacy hits via grep**

Run:
```bash
grep -nE "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{ChangeTeamModal,AddCuratedOperatorsModal,ChangeCuratorModal}.jsx
```

You will see 7 lines total (2 + 3 + 2). For each, pinpoint the rule-table mapping and apply it.

- [ ] **Step 3: Apply the rules table to each file**

Each of these modals has a `fixed inset-0` overlay container and a centered card. The card's surface usually goes through:
- `bg-white dark:bg-slate-800` → `bg-card`
- `border-slate-200 dark:border-slate-700` → `border-border`

Plus one or two button/CTA swaps and possibly a search input (member-pick lists have a search field). Refer to the rules table for each.

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests still pass**

Run: `npm test -- --run`
Expected: 235/235.

- [ ] **Step 6: Verify per-file grep is clean**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" src/components/staff/{ChangeTeamModal,AddCuratedOperatorsModal,ChangeCuratorModal}.jsx || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/components/staff/ChangeTeamModal.jsx \
        src/components/staff/AddCuratedOperatorsModal.jsx \
        src/components/staff/ChangeCuratorModal.jsx
git commit -m "feat(staff): swap Staff large modals to DS tokens

Subplan 6B1 task 4. Replace remaining slate/indigo classes in 3 larger member-selection modals (ChangeTeamModal 2 hits, AddCuratedOperatorsModal 3 hits, ChangeCuratorModal 2 hits = 7 hits total). Modals stay as fixed-overlay div components — shadcn <Dialog> migration is Subplan 6D. Behaviour preserved."
```

---

## Task 5: Final grep audit

**Goal:** Verify that across all 14 Staff sub-component files, zero legacy classes remain (excluding the documented role-badge DS-exception in `StaffListItem` and `StaffDetailPanel`).

**Files:** none (verification only).

- [ ] **Step 1: Run the canonical audit command**

Run:
```bash
grep -E "slate-|indigo-|bg-red-|text-red-|btn-primary|btn-ghost|btn-danger" \
  src/components/staff/{ProfileTab,AttributesTab,PermissionsTab,ActivityTab,ChangePasswordModal,DeleteRequestModal,ApprovalReviewModal,ChangeTeamModal,AddCuratedOperatorsModal,ChangeCuratorModal,CuratorBlock,CuratedOperatorsBlock,TeamMembershipBlock,RefCodePreview}.jsx \
  || echo "ALL CLEAN"
```
Expected: `ALL CLEAN`.

- [ ] **Step 2: Verify the DS-exception files are still present and untouched**

Run:
```bash
grep -E "slate-|violet-|blue-|emerald-|amber-" src/components/staff/{StaffListItem,StaffDetailPanel}.jsx | head -10
```
Expected: matches present (the documented 5-color role-badge palette + emerald status pill). These are intentional and were not touched in 6B1.

- [ ] **Step 3: Final build + tests + lint**

Run: `npm run build`
Expected: clean.

Run: `npm test -- --run`
Expected: 235/235.

Run: `npm run lint 2>&1 | grep -E "components/staff/(ProfileTab|AttributesTab|PermissionsTab|ActivityTab|ChangePasswordModal|DeleteRequestModal|ApprovalReviewModal|ChangeTeamModal|AddCuratedOperatorsModal|ChangeCuratorModal|CuratorBlock|CuratedOperatorsBlock|TeamMembershipBlock|RefCodePreview)" | head -20`
Expected: no output (no new lint warnings in modified files; pre-existing repo-wide warnings unrelated to Staff are acceptable).

- [ ] **Step 4: No commit (verification only)**

If any issue is found, fix in the affected file and append a follow-up commit before the PR.

---

## Task 6: Manual preview tour

**Goal:** Visually verify each tab + at least one modal flow renders with DS tokens and no console errors.

**Files:** none (verification only).

- [ ] **Step 1: Verify dev server is running**

Tool: `mcp__Claude_Preview__preview_list`
Expected: `operator-dashboard` server status `running`. If not, start with `mcp__Claude_Preview__preview_start { cwd: "/Users/artemsaskin/Work/operator-dashboard", command: "npm run dev" }`.

- [ ] **Step 2: Navigate to a staff member's detail page**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
window.location.href = '/staff/ADM-JuliaX-002'; window.location.pathname
```
Expected: `/staff/ADM-JuliaX-002` (or substitute another active staff `ref_code` from your seed; see seed migrations under `db/migrations/*_seed_*.sql` if needed).

- [ ] **Step 3: Screenshot each tab**

For each of `''`, `attributes`, `permissions`, `activity`:

Tool: `mcp__Claude_Preview__preview_click` with selector for the tab link, e.g.:
```
a[href$="/staff/ADM-JuliaX-002/attributes"]
```

Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: tab content renders with DS-token surfaces (`bg-card`, `text-foreground`, etc.). No `bg-white dark:bg-slate-800` slate aesthetics should be visible.

- [ ] **Step 4: Open the «Сменить пароль» modal**

Tool: `mcp__Claude_Preview__preview_click` with `selector: 'button'` searching by text «Сменить пароль» — alternative pattern:
```js
[...document.querySelectorAll('button')].find((b) => /Сменить пароль/.test(b.textContent))?.click()
```
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: modal renders with DS card surface, primary CTA, ghost cancel.

- [ ] **Step 5: Close the modal (Esc) and check console for errors**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
```
(Hand-rolled overlays may or may not respond to Esc — that's expected and is the reason 6D will migrate them to `<Dialog>`. If it doesn't close via Esc, click the cancel button or backdrop.)

Tool: `mcp__Claude_Preview__preview_console_logs` with `level: 'error'`
Expected: only pre-existing HMR cache errors related to deleted files (these are not from this change).

- [ ] **Step 6: No commit (verification only)**

If any visible regression is found, identify the affected file, fix, and append a follow-up commit before the PR.

---

## Task 7: Push branch + create PR

**Files:** none (git/gh).

The current `temashdesign` GitHub account lacks push permission to `clubmonaco2017-ops/operator-dashboard`. Switch to `clubmonaco2017-ops` for the push (per project memory `project_gh_auth.md`), then switch back after.

- [ ] **Step 1: Switch to push-capable GitHub user**

Run: `gh auth switch --user clubmonaco2017-ops`
Expected: `✓ Switched active account for github.com to clubmonaco2017-ops`

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/subplan-6b1-staff-subcomponents-sweep`
Expected: branch pushed, tracking set up.

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create --title "feat(staff): Subplan 6B1 — Staff sub-components DS sweep" --body "$(cat <<'EOF'
## Summary
- Family C first sweep — pure DS-token + shadcn-primitive swap of 14 Staff sub-component files (4 tabs + 6 modals + 4 utility blocks, ~1546 LOC).
- 4 commits, one per logical group (small high-hit files / tabs / utility blocks / large modals).
- Every legacy slate-/indigo-/red-/.btn-* class replaced per the documented rules table.
- Raw <button>/<input> swapped to shadcn <Button>/<Input> where applicable.
- Hand-rolled inline SVG warning/spinner icons swapped to lucide AlertCircle/Loader2/etc.
- role="alert" added on every error block that lacked it.

## Out of scope
- shadcn <Dialog> migration for the 6 hand-rolled modal overlays (Subplan 6D).
- StaffListItem / StaffDetailPanel — they own the documented 5-color role-badge DS-exception (untouched).
- .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css — happens after 6B1-6B4 land in Subplan 6C.
- Auth security migration — separate backlog spec at docs/superpowers/specs/2026-04-27-auth-security-migration-design.md (not part of this PR).

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green (no new tests; PermissionsTab.test.jsx still passes after class-only swaps)
- [x] npm run lint no new warnings in modified files
- [x] Final grep audit: zero hits across the 14 modified files
- [x] Browser preview: each detail tab (Профиль / Атрибуты / Права / Активность) renders with DS tokens
- [x] Browser preview: ChangePasswordModal opens with DS-card surface and shadcn buttons

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6b1-staff-subcomponents-sweep.md

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
- Add `- 6B1 (Staff sub-components DS sweep): 14 files, ~1546 LOC, ~63 legacy hits → 0; modals stayed div-overlays (Dialog migration → 6D)` to the Done list.
- Mark «Family C» as in progress with 6B1 done; remaining 6B2 (Tasks), 6B3 (Teams), 6B4 (Clients).

---

## Self-review

**Spec coverage:**
- §1 in-scope (14 files listed by name and tier): each file has a task assignment in Tasks 1-4 ✓.
- §1 standard replacements rule table: reproduced verbatim at the top of this plan, plus a worked example for `RefCodePreview.jsx` ✓.
- §1 out-of-scope (shadcn `<Dialog>` migration, role-badge palette, structural refactor, .btn-* CSS cleanup, animation polish): explicitly excluded in plan's «What NOT to do» block + Task 5 step 2 verifies role-badge files are untouched ✓.
- §3 behaviour contracts preserved: enforced by «What NOT to do» + Task 5 step 3 (npm test stays green) ✓.
- §4 acceptance criteria: build clean (Task 5 step 3), tests 235/235 (Task 5 step 3), grep audit clean (Task 5 step 1), lint clean (Task 5 step 3), preview tour (Task 6) ✓.
- §5 implementation order: groups match (Task 1 = quick wins / Task 2 = tabs / Task 3 = utility blocks / Task 4 = big modals) ✓.

**Placeholder scan:** no TBD/TODO/«implement later». Each step shows full code or full command. The rule table at the top is the substantive content — it is concrete and exhaustive enough that any individual file edit is mechanical.

**Type consistency:** no new symbols introduced. Imports are consistent with the existing codebase: `@/components/ui/button`, `@/components/ui/input` aliases match what 6A4-6A10 used. Lucide icon names (`AlertCircle`, `Loader2`, `Info`, `Check`) match the actual lucide-react exports.

**Note about Task structure deviating from the «TDD/test-per-task» pattern:** This subplan has no new tests because every file is presentational with no behavioural change. The TDD discipline is enforced indirectly: any behavioural drift would manifest as a regression in the existing 235 tests (especially `PermissionsTab.test.jsx`), so the rule is «if tests stay green, behaviour was preserved». This is intentional and aligned with how 6A4 / 6A5 / 6A6 / 6A7 / 6A9 / 6A10 were structured.
