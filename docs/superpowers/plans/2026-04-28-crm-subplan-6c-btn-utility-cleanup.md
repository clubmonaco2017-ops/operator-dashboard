# Subplan 6C — `.btn-*` utility-class cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unused `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` utility class definitions (and their `:hover` / `:focus-visible` / `:disabled` rules) from `src/index.css`. Family C sweep (6B1-6B4) cleared all consumers; this is the cleanup PR that finally removes the dead CSS.

**Architecture:** Single-file edit. Remove a contiguous 55-line block (lines 422-476) from `src/index.css`. No consumer file changes (already migrated to shadcn `<Button>`). No DS token changes (tokens like `--primary`, `--primary-hover`, `--surface` continue to be used by shadcn `<Button>` via `bg-primary`, etc.).

**Tech Stack:** Tailwind v4 with `@layer utilities`-style custom utility classes in `src/index.css`. ESLint v9, vitest, Vite.

**Spec:** [docs/superpowers/specs/2026-04-27-crm-subplan-6c-btn-utility-cleanup-design.md](../specs/2026-04-27-crm-subplan-6c-btn-utility-cleanup-design.md)

---

## File structure

**Modified — 1 file:**
- `src/index.css` — delete lines 422-476 (Buttons block: comment header + 3 class definitions + 9 pseudo-class rules + 2 trailing blanks)

**Untouched:**
- All `*.jsx` files — already use shadcn `<Button>`; no consumer references the deleted classes (verified by spec §3 pre-condition)
- DS tokens (`--primary`, `--primary-hover`, `--primary-fg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--danger-soft`, `--danger-ink`, `--focus-ring`, etc.) — preserved; still consumed by Tailwind utilities and shadcn `<Button>` variants

**Tests:** none added/modified. Unused CSS removal cannot affect test behavior.

---

## Setup

### Task 0: Verify baseline + create branch

**Files:** none (read-only).

- [ ] **Step 0.1: Verify clean working tree on `main`**

```bash
git status
git log --oneline -3
```
Expected: working tree clean; `HEAD` at the latest `main` commit (post-6D2: `bafa082`).

- [ ] **Step 0.2: Create feature branch from `main`**

```bash
git checkout -b feat/6c-btn-utility-cleanup
```

- [ ] **Step 0.3: CRITICAL — verify zero `.btn-*` consumers project-wide (spec §3 pre-condition)**

```bash
grep -rnE "\bbtn-(primary|ghost|danger-ghost)\b" src --include='*.jsx' --include='*.js'
```
Expected: **EMPTY OUTPUT**.

If non-empty, **STOP**. The 6B-series sweep was supposed to clear all consumers; non-empty result means a regression slipped in. Sweep the offending files first before proceeding.

- [ ] **Step 0.4: Verify the `.btn-*` block exists at lines 422-476**

```bash
grep -nE "\.btn-(primary|ghost|danger-ghost)|/\* --- Buttons" src/index.css
```
Expected output (matches lines exactly):
```
422:  /* --- Buttons (DS tokens) --- */
423:  .btn-primary {
437:  .btn-primary:hover { background: var(--primary-hover); }
438:  .btn-primary:focus-visible { outline: none; box-shadow: var(--focus-ring); }
439:  .btn-primary:disabled { background: var(--primary-disabled); cursor: not-allowed; }
441:  .btn-ghost {
455:  .btn-ghost:hover { background: var(--surface-2); border-color: var(--border-strong); }
456:  .btn-ghost:focus-visible { outline: none; box-shadow: var(--focus-ring); }
457:  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
459:  .btn-danger-ghost {
473:  .btn-danger-ghost:hover { background: var(--danger-soft); }
474:  .btn-danger-ghost:focus-visible { outline: none; box-shadow: var(--focus-ring); }
475:  .btn-danger-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
```
If line numbers differ, the file has shifted — adjust the Edit `old_string` in step 1.2 accordingly. The block content (the 55 lines) is what matters; it must match verbatim for the Edit to succeed.

- [ ] **Step 0.5: Verify lint baseline**

```bash
npm run lint 2>&1 | tail -3
```
Expected: `✖ 52 problems (51 errors, 1 warning)` — pre-existing baseline. Plan does NOT fix these.

- [ ] **Step 0.6: Verify build succeeds on baseline**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds with no errors. The output should end with something like `✓ built in <N>s` or similar Vite success indicator.

- [ ] **Step 0.7: Verify test suite passes on baseline**

```bash
npm run test:run 2>&1 | tail -5
```
Expected: `Tests 235 passed (235)`.

---

## Cleanup

### Task 1: Delete `.btn-*` block from `src/index.css`

**Files:**
- Modify: `src/index.css` (lines 422-476)

- [ ] **Step 1.1: Read the exact 55-line block to delete**

```bash
sed -n '420,478p' src/index.css
```
Expected: shows lines 420-478 inclusive. Lines 422-476 are the Buttons block (comment header + 3 class definitions + their pseudo-class rules + trailing blank). Lines 420-421 are the closing `}` + blank line of the previous `tabular` declaration; line 477 starts `/* --- Surfaces / cards --- */`. Don't touch 420-421 or 477+.

- [ ] **Step 1.2: Apply the deletion via the Edit tool**

Use the Edit tool with these exact arguments:

- `file_path`: `/Users/artemsaskin/Work/operator-dashboard/src/index.css`
- `old_string`: (the entire 55-line block, lines 422-476 verbatim, preserving leading 2-space indentation):

```
  /* --- Buttons (DS tokens) --- */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: var(--radius-md);
    background: var(--primary);
    color: var(--primary-fg);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1;
    padding: 8px 14px;
    box-shadow: var(--elev-1);
    transition: background var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
  }
  .btn-primary:hover { background: var(--primary-hover); }
  .btn-primary:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .btn-primary:disabled { background: var(--primary-disabled); cursor: not-allowed; }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg1);
    font-size: var(--fs-base);
    font-weight: 500;
    line-height: 1;
    padding: 8px 12px;
    transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }
  .btn-ghost:hover { background: var(--surface-2); border-color: var(--border-strong); }
  .btn-ghost:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-danger-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: var(--radius-md);
    border: 1px solid var(--danger-soft);
    background: var(--surface);
    color: var(--danger-ink);
    font-size: var(--fs-base);
    font-weight: 600;
    line-height: 1;
    padding: 8px 12px;
    transition: background var(--dur-fast) var(--ease);
  }
  .btn-danger-ghost:hover { background: var(--danger-soft); }
  .btn-danger-ghost:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .btn-danger-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  /* --- Surfaces / cards --- */
```

- `new_string`:

```
  /* --- Surfaces / cards --- */
```

This collapses the 55-line buttons block plus its trailing blank line into nothing, leaving the next-section comment header (`/* --- Surfaces / cards --- */`) as the immediate continuation after the previous `tabular` block's closing `}`.

Note on indentation: every line in the buttons block has a leading 2-space indentation because the entire `@layer utilities` (or equivalent wrapper) block is indented one level. The Edit must preserve this exact whitespace.

- [ ] **Step 1.3: Verify removal with `grep`**

```bash
grep -rnE "\bbtn-(primary|ghost|danger-ghost)\b" src
```
Expected: **EMPTY OUTPUT** — no `.btn-*` references remain anywhere in `src/`, including `src/index.css`.

- [ ] **Step 1.4: Verify the surrounding CSS remained intact**

```bash
sed -n '418,425p' src/index.css
```
Expected: shows the closing of the `tabular` block (line ~420), a blank line, then `/* --- Surfaces / cards --- */` immediately after — no orphan blank lines, no stray content. Approximate post-edit shape:

```
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
  }

  /* --- Surfaces / cards --- */
  .surface-card {
    background: var(--surface);
    ...
```

If you see two blank lines or stray closing brackets, the Edit's `old_string` matched too much or too little — investigate with `git diff` and adjust.

- [ ] **Step 1.5: Verify total line count dropped by 55**

```bash
wc -l src/index.css
```
Expected: 431 lines (was 486 at baseline; 486 - 55 = 431).

- [ ] **Step 1.6: Run lint**

```bash
npm run lint 2>&1 | tail -3
```
Expected: `✖ 52 problems (51 errors, 1 warning)` — same as baseline. ESLint does not lint CSS, so this is just a sanity check that nothing else broke.

- [ ] **Step 1.7: Run build**

```bash
npm run build 2>&1 | tail -10
```
Expected: build succeeds with no errors. The Tailwind/Vite CSS pipeline should produce a smaller CSS bundle (since 55 lines of unused utilities are gone) but no errors.

- [ ] **Step 1.8: Run full test suite**

```bash
npm run test:run 2>&1 | tail -5
```
Expected: `Tests 235 passed (235)`.

- [ ] **Step 1.9: Manual preview verification**

Run the dev server and open the app:

```bash
npm run dev
```

Visit each route and verify:
- `/dashboard` — KPI cards, charts, recent tasks render; at least one button is visible and styled correctly via shadcn `<Button>`
- `/clients` — list pane, master/detail split, "Создать клиента" button in toolbar — opens slide-out
- `/teams` — list pane, archive button in detail toolbar — clicking opens confirm dialog
- `/tasks` — task list, "Создать задачу" button — opens slide-out
- `/staff` — list pane (admin/superadmin only), "Сменить пароль" button visible
- `/notifications` — inbox renders
- `/login` — login form renders (open in incognito or sign out first)

For each page, open browser DevTools Console and confirm **no CSS-related errors or warnings** (e.g., no "selector not found", no "undefined custom property", no missing `--var`).

If any button looks broken (wrong color, missing padding, misaligned), `git diff src/index.css` to confirm only the buttons block was deleted, no accidental edits to surrounding CSS.

- [ ] **Step 1.10: Commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(design-system): Subplan 6C — remove unused .btn-* utility classes

Family C sweep (6B1-6B4) cleared all consumers; project-wide grep
for `\bbtn-(primary|ghost|danger-ghost)\b` was empty before this
commit. Deletes the 55-line buttons block (comment header + 3
class definitions + their :hover / :focus-visible / :disabled
rules) from src/index.css.

DS tokens preserved — all referenced custom properties (--primary,
--primary-hover, --surface, --border, --danger-soft, etc.) remain
in use by shadcn <Button> variants via Tailwind utilities.

No JSX changes. No test changes. Build, lint, tests unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## PR

### Task 2: Open 6C PR

- [ ] **Step 2.1: Switch to clubmonaco2017-ops user (per memory) and push branch**

```bash
gh auth switch --user clubmonaco2017-ops
git push -u origin HEAD
```

- [ ] **Step 2.2: Create PR**

```bash
gh pr create --title "feat(design-system): Subplan 6C — remove unused .btn-* utility classes" --body "$(cat <<'EOF'
## Summary

Final cleanup PR of the design-system rollout — removes the now-unused \`.btn-primary\` / \`.btn-ghost\` / \`.btn-danger-ghost\` utility classes from \`src/index.css\`. Family C sweep (6B1-6B4) had already cleared every consumer in production code; this is the bookkeeping commit that finally removes the dead CSS.

[Spec](docs/superpowers/specs/2026-04-27-crm-subplan-6c-btn-utility-cleanup-design.md) · [Plan](docs/superpowers/plans/2026-04-28-crm-subplan-6c-btn-utility-cleanup.md). Single file: \`src/index.css\` (~55 lines deleted).

## What changed

Deleted the buttons block at lines 422-476:
- \`/* --- Buttons (DS tokens) --- */\` section header
- \`.btn-primary\` definition + \`:hover\` / \`:focus-visible\` / \`:disabled\`
- \`.btn-ghost\` definition + \`:hover\` / \`:focus-visible\` / \`:disabled\`
- \`.btn-danger-ghost\` definition + \`:hover\` / \`:focus-visible\` / \`:disabled\`

## What's preserved

DS custom properties (\`--primary\`, \`--primary-hover\`, \`--primary-fg\`, \`--primary-disabled\`, \`--surface\`, \`--surface-2\`, \`--border\`, \`--border-strong\`, \`--danger-soft\`, \`--danger-ink\`, \`--focus-ring\`, \`--radius-md\`, \`--fs-base\`, \`--elev-1\`, \`--dur-fast\`, \`--ease\`) — all continue to be used by shadcn \`<Button>\` variants via Tailwind utilities (\`bg-primary\`, \`text-primary-foreground\`, \`hover:bg-primary/90\`, etc.).

## Pre-condition (verified before edit)

\`\`\`bash
$ grep -rnE "\\\\bbtn-(primary|ghost|danger-ghost)\\\\b" src --include='*.jsx' --include='*.js'
# (empty — zero consumers in production code)
\`\`\`

## Acceptance gate

\`\`\`bash
$ grep -rnE "\\\\bbtn-(primary|ghost|danger-ghost)\\\\b" src
# (empty — including src/index.css)
\`\`\`

## Test plan

- [x] \`npm run lint\` — 51 baseline errors unchanged
- [x] \`npm run build\` — clean
- [x] \`npm run test:run\` — 235/235
- [x] Project-wide \`.btn-*\` grep — empty
- [ ] Preview \`/dashboard\` — buttons render, no console errors
- [ ] Preview \`/clients\` — buttons + slide-out trigger work
- [ ] Preview \`/teams\` — confirm dialogs open from toolbar buttons
- [ ] Preview \`/tasks\` — list + slide-out trigger
- [ ] Preview \`/staff\` — admin actions render
- [ ] Preview \`/notifications\` — inbox renders
- [ ] Preview \`/login\` — login form renders

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
git branch -D feat/6c-btn-utility-cleanup
```

---

## Acceptance summary

After Task 2 merges:
- `src/index.css` no longer contains `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions
- Project-wide grep for `\bbtn-(primary|ghost|danger-ghost)\b` returns empty
- `src/index.css` is 431 lines (was 486)
- 235/235 tests pass; 51 baseline lint errors unchanged; build clean
- DS tokens preserved
- Design-system rollout dead-CSS cleanup complete
