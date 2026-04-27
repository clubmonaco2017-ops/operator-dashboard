# CRM Subplan 6A9 — NotificationsPage repaint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token swap of `src/pages/NotificationsPage.jsx` (71 LOC) — replace legacy slate/indigo/red palette and raw `<button>` with DS tokens and shadcn `<Button>`. No structural change.

**Architecture:** Single-file edit. The page stays standalone-centered (`max-w-3xl`) because it's an inbox list, not a master-detail roster. Behavior contracts (data hook, modal handoff, non-superadmin gating) are preserved 1-to-1.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>`. No new tests (page is thin presentational over already-tested `useDeletionRequests` + `ApprovalReviewModal`).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6a9-notifications-repaint-design.md`](../specs/2026-04-27-crm-subplan-6a9-notifications-repaint-design.md)

**Reference patterns:**
- `src/pages/TaskListPage.jsx` (post-6A5 token usage in body text + buttons).
- `src/components/staff/EmptyZero.jsx` (post-6A8 dashed empty card with DS tokens).

---

## File Structure

**Modified (1):** `src/pages/NotificationsPage.jsx`
**Created:** none
**Deleted:** none

**Branching:** Feature branch `feat/subplan-6a9-notifications-repaint` off main.

---

## Task 0: Setup — branch off main

**Files:** none

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6a9-notifications-repaint`
Expected: `Switched to a new branch 'feat/subplan-6a9-notifications-repaint'`

- [ ] **Step 3: Verify baseline build/test**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

---

## Task 1: Token swap NotificationsPage.jsx

**Files:**
- Modify: `src/pages/NotificationsPage.jsx`

Replace 11 legacy class usages + raw `<button>` element. Add `<Button>` import + `role="alert"` on error.

- [ ] **Step 1: Replace contents of NotificationsPage.jsx**

Replace the entire file `src/pages/NotificationsPage.jsx` with:

```jsx
import { useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { isSuperadmin } from '../lib/permissions.js'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'
import { Button } from '@/components/ui/button'

export function NotificationsPage() {
  const { user } = useAuth()
  const { rows, loading, error, reload } = useDeletionRequests(user?.id, 'pending')
  const [reviewing, setReviewing] = useState(null)

  if (!isSuperadmin(user)) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Недоступно</div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-2xl font-bold text-foreground">
            Оповещения
          </h1>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Запросы на удаление ({rows.length})
          </h2>

          {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {error && (
            <p className="text-sm text-[var(--danger-ink)]" role="alert">
              Ошибка: {error}
            </p>
          )}
          {!loading && !error && rows.length === 0 && (
            <p className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
              Нет запросов на рассмотрение
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {r.target_full_name}
                    <span className="ml-2 font-mono text-xs text-[var(--fg4)]">
                      {r.target_ref_code}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    от {r.requested_by_full_name} ·{' '}
                    {new Date(r.created_at).toLocaleString('ru-RU')}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {r.reason}
                  </div>
                </div>
                <Button size="sm" onClick={() => setReviewing(r)}>
                  Рассмотреть
                </Button>
              </li>
            ))}
          </ul>

          {reviewing && (
            <ApprovalReviewModal
              request={reviewing}
              onClose={() => setReviewing(null)}
              onDone={reload}
            />
          )}
        </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build, no errors.

- [ ] **Step 3: Verify tests**

Run: `npm test -- --run`
Expected: 235/235 passing.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NotificationsPage.jsx
git commit -m "feat(notifications): swap NotificationsPage to DS tokens

Subplan 6A9. Pure visual repaint of the standalone /notifications page (71 LOC). Replace slate/indigo/red palette with DS tokens (foreground / muted-foreground / border / card / danger-ink / fg4), swap raw <button> to shadcn <Button>, add role=alert to error <p>. Behavior contracts unchanged: useDeletionRequests + ApprovalReviewModal handoff preserved. ApprovalReviewModal token swap deferred to a future modal sweep."
```

---

## Task 2: Manual preview verification

**Files:** none (verification only)

- [ ] **Step 1: Verify dev server is running**

Tool: `mcp__Claude_Preview__preview_list`
Expected: `operator-dashboard` server status `running`.

- [ ] **Step 2: Navigate to /notifications and screenshot**

Tool: `mcp__Claude_Preview__preview_eval` with `window.location.href = '/notifications'; window.location.pathname`
Expected: `/notifications`.

Tool: `mcp__Claude_Preview__preview_screenshot`
Expected:
- h1 «Оповещения» renders in `text-foreground`.
- h2 «Запросы на удаление (N)» renders in `text-muted-foreground`.
- If list empty: dashed-border card with «Нет запросов на рассмотрение» text.
- If list non-empty: each item card uses `bg-card` + `border-border`; «Рассмотреть» renders as a shadcn `<Button>` (filled primary).

- [ ] **Step 3: Check console for errors**

Tool: `mcp__Claude_Preview__preview_console_logs` with `level: 'error'`
Expected: no errors.

- [ ] **Step 4: If list has at least one item — click "Рассмотреть"**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
[...document.querySelectorAll('button')].find((b) => /Рассмотреть/.test(b.textContent))?.click(); 'clicked'
```
Tool: `mcp__Claude_Preview__preview_screenshot`
Expected: `ApprovalReviewModal` appears (legacy styling — out of scope for this subplan, deferred).

- [ ] **Step 5: Press Esc to close modal (if opened in step 4)**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
```

- [ ] **Step 6: No commit (verification only)**

If any visual issue is found, fix in `src/pages/NotificationsPage.jsx` and re-verify; combine fixes with Task 1 in a single new commit (don't amend).

---

## Task 3: Push branch + create PR

**Files:** none (git/gh)

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feat/subplan-6a9-notifications-repaint`
Expected: branch pushed, tracking set up.

- [ ] **Step 2: Create PR**

Run:
```bash
gh pr create --title "feat(notifications): Subplan 6A9 — NotificationsPage repaint" --body "$(cat <<'EOF'
## Summary
- Pure DS-token swap of /notifications (71 LOC standalone page).
- Replace slate/indigo/red Tailwind palette with DS tokens (foreground / muted-foreground / border / card / danger-ink / fg4).
- Swap raw <button> to shadcn <Button size="sm">.
- Add role=alert on error <p> for screen readers.
- No structural changes — page stays standalone-centered (max-w-3xl), correct shape for an inbox list (not a master-detail roster).

## Out of scope
- ApprovalReviewModal DS-token swap (deferred to a future modal sweep alongside ChangePasswordModal / DeleteRequestModal etc.).
- .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css (after LoginPage repaint completes Family B).

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green (no new tests — purely presentational)
- [x] Browser preview /notifications: h1, h2, empty state, list items render with DS tokens
- [x] Browser preview /notifications: «Рассмотреть» opens ApprovalReviewModal (legacy modal, expected)
- [x] No console errors

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6a9-notifications-repaint-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6a9-notifications-repaint.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Update DS rollout roadmap memory after merge**

After the PR merges, update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`:
- Add `- 6A9 (NotificationsPage repaint): pure token swap of /notifications standalone page` to Done list.
- Mark `NotificationsPage` as DONE in Family B; remaining = LoginPage.

---

## Self-review

Spec coverage:
- §1 in-scope: 11 token replacements + raw button swap + error a11y → covered by Task 1 ✓.
- §1 out-of-scope: ApprovalReviewModal swap (excluded from plan) ✓; non-superadmin redirect (excluded) ✓; .btn-* CSS cleanup (excluded) ✓.
- §3 behavior contracts: each contract preserved verbatim in the rewritten file ✓.
- §4 acceptance criteria: build clean (Task 1 step 2) ✓; 235/235 (Task 1 step 3) ✓; preview checks (Task 2) ✓.

Placeholder scan: no TBD/TODO/"add error handling later" anywhere. Each step shows full code or full command.

Type consistency: only one file modified, no new symbols introduced; `<Button>` from `@/components/ui/button` matches the import alias used in 6A4/6A5/6A7/6A8.
