# CRM Subplan 6B4 — Clients sub-components DS sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token + shadcn-`<Button>` swap across 7 Clients sub-components (1 profile tab + 2 gallery tabs + 1 lightbox + 1 slide-out + 2 confirm dialogs, ~3402 LOC, 18 legacy hits) with no behaviour or structural changes. **Final Family C sweep — after this lands, no production code references `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost`, unblocking Subplan 6C.**

**Architecture:** Mechanical class-replacement work driven by the same rule table that powered Subplans 6B1, 6B2, 6B3. Tasks group files by tier (confirm dialogs / profile tab + lightbox / slide-out / gallery tabs). The gallery tabs are the largest files in the project (832 + 984 LOC) — surgical hit-line-only edits to preserve upload/drag-drop/lightbox UX.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>` / `<Input>` + lucide-react. No new tests (presentational; existing test suite covers behaviour-invariant changes).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6b4-clients-subcomponents-sweep-design.md`](../specs/2026-04-27-crm-subplan-6b4-clients-subcomponents-sweep-design.md)

**Reference patterns:**
- Subplan 6B1 (PR #30), 6B2 (PR #31), 6B3 (PR #32) — the canonical Family C sweeps; same rules table reused here.
- Post-6B3: `src/components/teams/ArchiveTeamConfirmDialog.jsx` — destructive-secondary archive submit using `<Button variant="ghost">` + danger className.

---

## Rules table (apply uniformly to every file in this subplan)

Identical to 6B1/6B2/6B3 rules. Reproduced verbatim so the implementer has a single source of truth.

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
| Raw `<button className="rounded-lg border border-slate-200 …">` (secondary/cancel) | `<Button variant="ghost">label</Button>` |
| **Destructive primary** (`bg-red-600 text-white`) | `<Button variant="destructive">` |
| **Destructive secondary** (`.btn-danger-ghost`, `border-red-…` outline) | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| `.btn-primary` utility | `<Button>` default variant |
| `.btn-ghost` utility | `<Button variant="ghost">` |
| `.btn-danger-ghost` utility | `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">` |
| Raw `<input>` with custom slate/indigo styling | shadcn `<Input>` — drop the bespoke className |
| Raw `<textarea>` | keep native; DS-token its className |
| Raw `<select>` | keep native, DS-token the className (or shadcn `<Select>` if clean drop-in) |
| Inline SVG warning/info/check icon | lucide `<AlertCircle>` / `<Info>` / `<Check>` |
| Hand-rolled spinner SVG | lucide `<Loader2 className="animate-spin">` |

**Preserve destructive emphasis:** When the legacy code distinguishes a destructive primary (`bg-red-600 text-white`) from a destructive secondary (`.btn-danger-ghost` or `border-red-…` outline), preserve that distinction. The button that triggers the actual destructive RPC is the destructive one — even if labelled «Архивировать» / «Закрыть без сохранения» / «Удалить фото» rather than «Удалить».

**What NOT to do:**

- Do NOT change `useState`, `useEffect`, RPC call signatures, prop names, conditional render structure, JSX tree shape, or any handler logic. Pure visual change.
- Do NOT migrate hand-rolled `fixed inset-0` modal overlays / hand-rolled slide-outs / lightbox to shadcn `<Dialog>` / `<Sheet>`. That is Subplan 6D.
- **Do NOT touch upload/drag-drop/bulk-select/lightbox-keyboard logic in the gallery tabs (`PhotoGalleryTab`, `VideoGalleryTab`).** These are large files (832 + 984 LOC) but only have 3 + 5 hit lines. The diff per file should be 3-5 lines, not a refactor.
- Do NOT redesign the slide-out form, photo viewer, or any UX.
- Do NOT remove `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions from `src/index.css`. That is Subplan 6C, immediately following 6B4.
- Do NOT touch any file beyond the 7 listed.
- Do NOT touch `ActivityCard.jsx`, `ClientDetailPanel.jsx`, `SummaryCard.jsx` (verified DS-clean already), or any master-layer file (`ClientList`, `ClientListItem`, etc., already swept in 6A4).
- Do NOT add unused imports. Use the `@/components/ui/button` alias (not `'../ui/button.jsx'`).

---

## File Structure

**Modified (7):**
- Confirm dialogs: `CreateClientCloseConfirm.jsx`, `ArchiveConfirmDialog.jsx` (126 LOC, 3 hits)
- Profile tab + lightbox: `ProfileTab.jsx`, `ClientLightbox.jsx` (878 LOC, 4 hits)
- Slide-out: `CreateClientSlideOut.jsx` (582 LOC, 3 hits)
- Gallery tabs: `PhotoGalleryTab.jsx`, `VideoGalleryTab.jsx` (1816 LOC, 8 hits)

**Created:** none.
**Deleted:** none.

**Branching:** Feature branch `feat/subplan-6b4-clients-subcomponents-sweep` off main.

---

## Task 0: Setup — branch off main

**Files:** none.

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --rebase origin main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6b4-clients-subcomponents-sweep`
Expected: `Switched to a new branch 'feat/subplan-6b4-clients-subcomponents-sweep'`

- [ ] **Step 3: Verify baseline build/tests**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Capture baseline grep audit**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{ProfileTab,PhotoGalleryTab,VideoGalleryTab,ClientLightbox,CreateClientSlideOut,CreateClientCloseConfirm,ArchiveConfirmDialog}.jsx \
  | wc -l
```
Expected: 18 hits across the 7 files.

---

## Task 1: Sweep confirm dialogs

**Goal:** Apply the rule table to the 2 confirm dialogs.

**Files:**
- Modify: `src/components/clients/CreateClientCloseConfirm.jsx` (62 LOC, 1 hit)
- Modify: `src/components/clients/ArchiveConfirmDialog.jsx` (64 LOC, 2 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/clients/CreateClientCloseConfirm.jsx
cat src/components/clients/ArchiveConfirmDialog.jsx
```

- [ ] **Step 2: Locate the legacy hits**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{CreateClientCloseConfirm,ArchiveConfirmDialog}.jsx
```

- [ ] **Step 3: Apply the rules table**

Both are confirm dialogs with `fixed inset-0` overlay (preserve as-is).

- `CreateClientCloseConfirm` confirms «discard unsaved changes» — the «Закрыть без сохранения» submit button is a destructive action. Read original styling: if `.btn-danger-ghost` → `<Button variant="ghost">` + danger className; if `bg-red-600` → `<Button variant="destructive">`. Cancel «Продолжить редактирование» → `<Button variant="ghost">` (no danger).
- `ArchiveConfirmDialog` confirms archive — same destructive-emphasis logic. Read original styling.

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
  src/components/clients/{CreateClientCloseConfirm,ArchiveConfirmDialog}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/CreateClientCloseConfirm.jsx \
        src/components/clients/ArchiveConfirmDialog.jsx
git commit -m "feat(clients): swap Clients confirm dialogs to DS tokens

Subplan 6B4 task 1. Replace slate/indigo/red palette + raw <button> with DS tokens and shadcn primitives in the 2 confirm dialogs (CreateClientCloseConfirm 1 hit, ArchiveConfirmDialog 2 hits = 3 hits total). Destructive submits honour destructive-emphasis rule from original styling. Hand-rolled overlays kept (Dialog migration is Subplan 6D)."
```

---

## Task 2: Sweep profile tab + lightbox

**Goal:** Apply the rule table to `ProfileTab` and `ClientLightbox`. Lightbox keyboard nav and viewer logic must be untouched.

**Files:**
- Modify: `src/components/clients/ProfileTab.jsx` (448 LOC, 2 hits)
- Modify: `src/components/clients/ClientLightbox.jsx` (430 LOC, 2 hits)

- [ ] **Step 1: Read each file in full**

Run:
```bash
cat src/components/clients/ProfileTab.jsx
cat src/components/clients/ClientLightbox.jsx
```

- [ ] **Step 2: Locate the legacy hits**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{ProfileTab,ClientLightbox}.jsx
```

You will see 4 lines total (2 + 2).

- [ ] **Step 3: Apply the rules table**

`ProfileTab` likely has a save/cancel pair for inline-edit fields. Map per rules table.

`ClientLightbox` is a fullscreen viewer (430 LOC). The 2 hits are most likely close-button styling or an action button (delete photo / next-prev nav). **Touch only the 2 hit lines.** Do NOT modify keyboard event handlers, swipe gestures, image loading, focus trap, or any other viewer logic.

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
  src/components/clients/{ProfileTab,ClientLightbox}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/ProfileTab.jsx \
        src/components/clients/ClientLightbox.jsx
git commit -m "feat(clients): swap Clients profile tab + lightbox to DS tokens

Subplan 6B4 task 2. Replace slate/indigo/red palette + raw <button>/<input> in ProfileTab (2 hits) and ClientLightbox (2 hits = 4 hits total). Lightbox viewer logic (keyboard nav, swipe gestures, focus trap, image loading) untouched — only close/action button styling swapped. Behaviour preserved 1:1."
```

---

## Task 3: Sweep CreateClientSlideOut

**Goal:** Apply the rule table to the slide-out form (largest in the project at 582 LOC).

**Files:**
- Modify: `src/components/clients/CreateClientSlideOut.jsx` (582 LOC, 3 hits)

- [ ] **Step 1: Read the file in full**

Run: `cat src/components/clients/CreateClientSlideOut.jsx`

- [ ] **Step 2: Locate the 3 legacy hits**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/CreateClientSlideOut.jsx
```

- [ ] **Step 3: Apply the rules table**

Likely hits: footer cancel + submit pair (2 of the 3) plus an inline action (e.g. dirty-close trigger). Map per rules. **Do NOT migrate the slide-out panel to `<Sheet>`.**

- [ ] **Step 4: Verify build clean**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Verify tests pass**

Run: `npm test -- --run`
Expected: 235/235. If `CreateClientSlideOut.test.jsx` exists, it must stay green.

- [ ] **Step 6: Verify grep clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/CreateClientSlideOut.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify no unused imports**.

- [ ] **Step 8: Commit**

```bash
git add src/components/clients/CreateClientSlideOut.jsx
git commit -m "feat(clients): swap CreateClientSlideOut to DS tokens

Subplan 6B4 task 3. Replace slate/indigo/red palette + raw <button>/<input> in the client creation slide-out (3 hits). Hand-rolled fixed-position panel kept (Sheet migration is Subplan 6D). Behaviour preserved."
```

---

## Task 4: Sweep gallery tabs

**Goal:** Apply the rule table to the 2 largest files in the project. **Surgical hit-line-only edits — DO NOT touch upload/drag-drop/bulk-select logic.**

**Files:**
- Modify: `src/components/clients/PhotoGalleryTab.jsx` (832 LOC, 3 hits)
- Modify: `src/components/clients/VideoGalleryTab.jsx` (984 LOC, 5 hits)

- [ ] **Step 1: Locate the 8 legacy hits via grep BEFORE reading the files**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{PhotoGalleryTab,VideoGalleryTab}.jsx
```

You will see 8 lines total (3 + 5). Note the line numbers.

- [ ] **Step 2: Read only the relevant ranges around each hit (±10 lines context)**

For each hit line N, read lines (N-10)..(N+10) to understand the JSX context:

```bash
sed -n 'X,Yp' src/components/clients/PhotoGalleryTab.jsx
```

(Substitute X = N-10, Y = N+10 per hit. Don't need to read the full 832/984 LOC file.)

This is the discipline: stay in hit-line context, do not browse the upload/drag-drop logic.

- [ ] **Step 3: Apply the rules table**

For each hit:
- If it's a `.btn-primary` / `.btn-ghost` button — swap to `<Button>` with appropriate variant.
- If it's a `bg-white dark:bg-slate-800` surface — swap to `bg-card`.
- If it's a `text-slate-…` text — swap to `text-foreground` or `text-muted-foreground`.
- If it's a destructive button (e.g. «Удалить фото» / «Удалить видео» / «Удалить выбранные»), apply destructive-emphasis: `<Button variant="ghost">` + danger className for `.btn-danger-ghost` originals, or `<Button variant="destructive">` for filled `bg-red-600` originals.

**DO NOT touch:**
- `useState` for `selected` / `uploading` / `dragOver` / etc.
- `useEffect` for keyboard listeners, intersection observers, etc.
- `useRef` for fileInput, dropZone, etc.
- `onDrop`, `onDragOver`, `onDragLeave`, `onChange` handlers.
- `useDebounce`, `useMemo` filters.
- `MediaUploadTile` or any upload-progress sub-components.
- Tile rendering, lazy loading, image sizing.

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
  src/components/clients/{PhotoGalleryTab,VideoGalleryTab}.jsx \
  || echo "clean"
```
Expected: `clean`.

- [ ] **Step 7: Verify diff is small (≤ ~25 changed lines per file)**

Run:
```bash
git diff --stat src/components/clients/PhotoGalleryTab.jsx
git diff --stat src/components/clients/VideoGalleryTab.jsx
```
Expected: each file has ≤ 25 line changes (insertions + deletions). If significantly more, you've drifted out of scope — reconsider what you touched.

- [ ] **Step 8: Verify no unused imports**.

- [ ] **Step 9: Commit**

```bash
git add src/components/clients/PhotoGalleryTab.jsx \
        src/components/clients/VideoGalleryTab.jsx
git commit -m "feat(clients): swap Clients gallery tabs to DS tokens

Subplan 6B4 task 4. Replace slate/indigo/red palette + raw <button>/<input> in the 2 gallery tabs (PhotoGalleryTab 3 hits, VideoGalleryTab 5 hits = 8 hits total). Surgical hit-line-only edits — upload UX, drag-drop handlers, lightbox keyboard nav, bulk-select state are byte-for-byte identical to pre-6B4. Behaviour preserved 1:1."
```

---

## Task 5: Final grep audit

**Goal:** Verify zero legacy classes remain across the 7 modified Clients sub-component files. Verify `.btn-*` is now unreferenced in production code (unblocking Subplan 6C).

**Files:** none (verification only).

- [ ] **Step 1: Run the canonical audit on the 7 swept files**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{ProfileTab,PhotoGalleryTab,VideoGalleryTab,ClientLightbox,CreateClientSlideOut,CreateClientCloseConfirm,ArchiveConfirmDialog}.jsx \
  || echo "ALL CLEAN"
```
Expected: `ALL CLEAN`.

- [ ] **Step 2: Verify out-of-scope files still clean**

Run:
```bash
grep -nE "(^|[^a-z-])(slate-|indigo-|btn-primary|btn-ghost|btn-danger)|bg-red-|text-red-|border-red-" \
  src/components/clients/{ActivityCard,ClientDetailPanel,SummaryCard}.jsx \
  || echo "out-of-scope clean"
```
Expected: `out-of-scope clean`.

- [ ] **Step 3: Project-wide `.btn-*` consumer audit**

Run:
```bash
grep -rnE "\.btn-(primary|ghost|danger-ghost)|\bbtn-(primary|ghost|danger-ghost)\b" \
  src --include='*.jsx' --include='*.js' \
  | grep -v "src/index.css"
```
Expected: zero matches outside `src/index.css`. If any remain, those files were missed and need a follow-up sweep before 6C can proceed.

- [ ] **Step 4: Final build + tests + lint**

Run: `npm run build`
Expected: clean.

Run: `npm test -- --run`
Expected: 235/235.

Run: `npm run lint 2>&1 | grep -E "components/clients/(ProfileTab|PhotoGalleryTab|VideoGalleryTab|ClientLightbox|CreateClientSlideOut|CreateClientCloseConfirm|ArchiveConfirmDialog)" | head -20`
Expected: no output.

- [ ] **Step 5: No commit (verification only)**

If the project-wide grep in Step 3 finds remaining consumers, fix them in a follow-up commit (single small swap) before proceeding to Task 6.

---

## Task 6: Push branch + create PR

**Files:** none (git/gh).

- [ ] **Step 1: Switch to push-capable GitHub user**

Run: `gh auth switch --user clubmonaco2017-ops`
Expected: `✓ Switched active account for github.com to clubmonaco2017-ops`

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/subplan-6b4-clients-subcomponents-sweep`
Expected: branch pushed.

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create --title "feat(clients): Subplan 6B4 — Clients sub-components DS sweep" --body "$(cat <<'EOF'
## Summary
- Family C **final** sweep — pure DS-token + shadcn-primitive swap of 7 Clients sub-component files (1 profile tab + 2 gallery tabs + 1 lightbox + 1 slide-out + 2 confirm dialogs, ~3402 LOC).
- 4 commits across 4 logical task groups (confirm dialogs / profile tab + lightbox / slide-out / gallery tabs).
- Every legacy slate-/indigo-/red-/.btn-* class replaced (18 hits → 0; verified via tightened grep).
- Raw <button>/<input> → shadcn <Button>/<Input> per CTA / secondary / destructive distinction.
- Destructive-emphasis rule honoured: ArchiveConfirmDialog + CreateClientCloseConfirm submits + any inline destructive-secondary buttons inside gallery tabs map per original styling.
- Gallery tabs (832 + 984 LOC) — surgical hit-line-only edits. Upload UX, drag-drop handlers, lightbox keyboard nav, bulk-select state untouched.

## Family C complete after this PR
6B1 (Staff) + 6B2 (Tasks) + 6B3 (Teams) + 6B4 (Clients) = all 4 modules' detail-tabs/modals/slide-outs swept. Project-wide grep confirms zero `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` consumers outside `src/index.css`. **Next: Subplan 6C** removes those CSS class definitions.

## Out of scope
- shadcn <Dialog> / <Sheet> migration for hand-rolled overlays — separate future Subplan 6D.
- ActivityCard / ClientDetailPanel / SummaryCard — verified DS-clean already (untouched).
- Master-layer files (ClientList / ClientListItem / EmptyZero / EmptyFilter / DetailEmptyHint / ClientFilterChips / BulkActionBar / DropOverlay) — already swept in 6A4.
- .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css — Subplan 6C, immediately following this PR.

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green
- [x] Final grep audit: zero hits across the 7 modified files
- [x] Project-wide grep: zero .btn-* consumers outside src/index.css
- [x] Out-of-scope files (ActivityCard / ClientDetailPanel / SummaryCard) untouched
- [x] Spec compliance + code quality review per task

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6b4-clients-subcomponents-sweep-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6b4-clients-subcomponents-sweep.md

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
- Add `- 6B4 (Clients sub-components DS sweep): 7 files, ~3402 LOC, 18 legacy hits → 0; gallery tabs surgical-only` to the Done list.
- Mark «Family C» as fully complete (4/4).
- Add note: «Next up: Subplan 6C — remove `.btn-*` CSS class definitions from `src/index.css`. Project-wide grep confirms zero consumers outside the definitions.»

---

## Self-review

**Spec coverage:**
- §1 in-scope (7 files listed by name and tier): each has a task assignment in Tasks 1-4 ✓.
- §1 rules table: reproduced verbatim, plus destructive-emphasis ✓.
- §1 out-of-scope (Dialog/Sheet, gallery UX, lightbox keyboard, structural refactor, .btn-* CSS cleanup): excluded in plan's «What NOT to do» block + Task 4 explicitly enumerates what NOT to touch in gallery tabs ✓.
- §3 behaviour contracts preserved: enforced by «What NOT to do» + per-task tests + Task 4 step 7 (diff size cap of ≤25 lines per gallery file) ✓.
- §4 acceptance criteria (build / tests / grep / out-of-scope check / preview / .btn-* unblock): Task 5 covers all five auditing criteria ✓.
- §4 critical milestone (post-6B4 .btn-* unreferenced): Task 5 step 3 verifies via project-wide grep ✓.
- §5 implementation order (smallest-first): Task 1 = 126 LOC, Task 2 = 878 LOC, Task 3 = 582 LOC, Task 4 = 1816 LOC ✓.

**Placeholder scan:** no TBD/TODO/«implement later». Each step shows full code or full command.

**Type consistency:** no new symbols introduced. Imports use `@/components/ui/button` alias. Lucide icon names match actual exports.

**Risk-management notes baked into Task 4:** the gallery-tab task explicitly:
1. Reads only ±10 lines around each hit (Step 2) instead of the full file — discipline against scope drift.
2. Enumerates which logic NOT to touch (Step 3).
3. Caps the diff size at ≤25 lines per file (Step 7) — quantitative scope guard.

This is the strongest scope-protection any task in the Family C sweeps has had, in proportion to the risk (largest files in the project).
