# CRM Subplan 6A10 — LoginPage repaint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pure DS-token swap of `src/LoginPage.jsx` (103 LOC) — replace legacy slate/indigo/red palette + raw `<input>`/`<button>` + 2 inline SVGs with DS tokens, shadcn primitives (`<Input>`, `<Button>`), and lucide icons (`AlertCircle`, `Loader2`). No structural change, no behaviour change.

**Architecture:** Single-file edit. Page stays standalone full-screen unauthenticated (`min-h-screen` flex-centered card with `max-w-sm`). Login flow contract (`onLogin(email, password) → { success, error }`) preserved verbatim.

**Tech Stack:** React 19 + Tailwind CSS v4 + shadcn `<Button>` + shadcn `<Input>` + lucide-react. No new tests (page is thin presentational; existing `useAuth.test.jsx` covers auth flow at hook level).

**Spec:** [`docs/superpowers/specs/2026-04-27-crm-subplan-6a10-loginpage-repaint-design.md`](../specs/2026-04-27-crm-subplan-6a10-loginpage-repaint-design.md)

**Reference patterns:**
- `src/pages/NotificationsPage.jsx` (post-6A9) — sister Family-B repaint of standalone page.
- `src/components/staff/CreateStaffSlideOut.jsx` — inline error block with `var(--danger-soft)` / `var(--danger-ink)` pattern + `role="alert"`.

---

## File Structure

**Modified (1):** `src/LoginPage.jsx` — token swap + primitive swap. Default export name preserved (`export default function LoginPage`).
**Created:** none.
**Deleted:** none.

**Branching:** Feature branch `feat/subplan-6a10-loginpage-repaint` off main.

---

## Task 0: Setup — branch off main

**Files:** none

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --rebase origin main`.

- [ ] **Step 2: Create and switch to feature branch**

Run: `git checkout -b feat/subplan-6a10-loginpage-repaint`
Expected: `Switched to a new branch 'feat/subplan-6a10-loginpage-repaint'`

- [ ] **Step 3: Verify baseline**

Run: `npm test -- --run`
Expected: 235/235 passing.

Run: `npm run build`
Expected: clean build.

---

## Task 1: Repaint LoginPage.jsx

**Files:**
- Modify: `src/LoginPage.jsx` (full rewrite of the file)

Replace 103 LOC with the DS-token version below. Imports change: drop `BarChart3`-only line, add `AlertCircle`, `Loader2`, shadcn `Input`, shadcn `Button`. Behaviour unchanged.

- [ ] **Step 1: Replace contents of `src/LoginPage.jsx`**

Replace the entire file with:

```jsx
import { useState } from 'react'
import { AlertCircle, BarChart3, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setSubmitting(true)
    const result = await onLogin(email.trim(), password)
    if (!result.success) {
      setError(result.error || 'Ошибка авторизации')
    }
    setSubmitting(false)
  }

  const busy = submitting || loading

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 transition-colors">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <BarChart3 size={28} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Дашборд операторов</h1>
          <p className="text-sm text-muted-foreground mt-1">Войдите в свой аккаунт</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide"
              >
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={busy}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide"
              >
                Пароль
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={busy}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-[var(--danger-soft)] border border-[var(--danger-strong)] rounded-xl px-4 py-3"
              >
                <AlertCircle
                  size={16}
                  className="text-[var(--danger-ink)] flex-shrink-0 mt-0.5"
                />
                <p className="text-sm text-[var(--danger-ink)]">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="w-full"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1.5" />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </Button>
          </form>
        </div>
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
Expected: 235/235 passing (no test changes; `useAuth.test.jsx` exercises the login flow at the hook level).

- [ ] **Step 4: Lint check (just the modified file)**

Run: `npm run lint 2>&1 | grep -E "LoginPage" | head -10`
Expected: no output (no new lint errors in LoginPage.jsx). Pre-existing repo-wide lint warnings unrelated to this file are acceptable.

- [ ] **Step 5: Commit**

```bash
git add src/LoginPage.jsx
git commit -m "feat(login): swap LoginPage to DS tokens

Subplan 6A10. Family B final sweep — pure visual repaint of the standalone unauthenticated /login page (103 LOC). Replace slate/indigo/red palette with DS tokens (background / foreground / muted-foreground / primary / card / border / danger-soft / danger-strong / danger-ink). Replace raw <input> with shadcn <Input> (×2). Replace raw <button> + inline spinner SVG with shadcn <Button> + lucide <Loader2>. Replace inline warning SVG with lucide <AlertCircle>. Add role=alert on error block. Behaviour preserved: onLogin contract, autoFocus on email, required attrs, busy gate, error lifecycle."
```

---

## Task 2: Manual preview verification

**Files:** none (verification only)

This page is shown only when logged out, so use a private window or `logout()` first. The dev server preview at `localhost:5173` shows the LoginPage when there is no `auth_session` in `localStorage`.

- [ ] **Step 1: Verify dev server is running**

Tool: `mcp__Claude_Preview__preview_list`
Expected: `operator-dashboard` server status `running`. If not running, start it via `mcp__Claude_Preview__preview_start { cwd: "/Users/artemsaskin/Work/operator-dashboard", command: "npm run dev" }`.

- [ ] **Step 2: Logout to surface LoginPage**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
localStorage.removeItem('auth_session'); window.location.href = '/'; 'cleared'
```

Expected: page reloads, LoginPage rendered.

- [ ] **Step 3: Screenshot empty form state**

Tool: `mcp__Claude_Preview__preview_screenshot`
Expected:
- Full-screen `bg-background` (DS-token background colour, not slate-100).
- Centered `max-w-sm` card with `bg-card` + `border-border`.
- Logo container 14×14 in `bg-primary` colour.
- h1 «Дашборд операторов» in `text-foreground`, subtitle in `text-muted-foreground`.
- Two shadcn `<Input>` fields with placeholder text «you@example.com» / «••••••••».
- Submit button «Войти» rendered as shadcn `<Button>` (filled primary, full-width).

- [ ] **Step 4: Trigger error path (invalid credentials)**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
const email = document.getElementById('login-email')
const pw = document.getElementById('login-password')
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
setter.call(email, 'wrong@example.com')
email.dispatchEvent(new Event('input', { bubbles: true }))
setter.call(pw, 'wrongpassword')
pw.dispatchEvent(new Event('input', { bubbles: true }))
document.querySelector('button[type="submit"]')?.click()
'submitted'
```

Wait ~2 seconds (auth_login RPC), then:

Tool: `mcp__Claude_Preview__preview_screenshot`
Expected:
- Error block visible with lucide `<AlertCircle>` icon (NOT inline SVG warning circle).
- Error background uses `var(--danger-soft)` (subtle danger tint, not bright bg-red-50).
- Error text «Неверный email или пароль» (or whatever auth_login returns) in `var(--danger-ink)`.
- `role="alert"` present on error wrapper (verify via DOM query).

- [ ] **Step 5: Verify role=alert via DOM**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
document.querySelector('[role="alert"]')?.textContent || 'no alert'
```
Expected: returns the error text — confirms `role="alert"` attribute is present.

- [ ] **Step 6: Check console for errors**

Tool: `mcp__Claude_Preview__preview_console_logs` with `level: 'error'`
Expected: only the failed login network response (HTTP 4xx/5xx is normal); no React-level errors or warnings.

- [ ] **Step 7: Verify loading state on submit click (transient)**

Tool: `mcp__Claude_Preview__preview_eval` with:
```js
document.querySelector('button[type="submit"]')?.click()
const btn = document.querySelector('button[type="submit"]')
const hasSpinner = !!btn?.querySelector('svg.animate-spin') || /Вход/.test(btn?.textContent || '')
hasSpinner
```
Expected: returns `true` — the spinner replaces the «Войти» text mid-submission (`<Loader2>` with `animate-spin` class).

- [ ] **Step 8: No commit (verification only)**

If a visual issue is found, fix in `src/LoginPage.jsx` and re-verify; combine fixes with Task 1 in a single new commit (don't amend).

---

## Task 3: Push branch + create PR

**Files:** none (git/gh)

The current `temashdesign` GitHub account lacks push permission to `clubmonaco2017-ops/operator-dashboard`. Switch to `clubmonaco2017-ops` for the push (per project memory `project_gh_auth.md`), then switch back after.

- [ ] **Step 1: Switch to push-capable GitHub user**

Run: `gh auth switch --user clubmonaco2017-ops`
Expected: `✓ Switched active account for github.com to clubmonaco2017-ops`

- [ ] **Step 2: Push the branch**

Run: `git push -u origin feat/subplan-6a10-loginpage-repaint`
Expected: `* [new branch]      feat/subplan-6a10-loginpage-repaint -> feat/subplan-6a10-loginpage-repaint`

- [ ] **Step 3: Create PR**

Run:
```bash
gh pr create --title "feat(login): Subplan 6A10 — LoginPage repaint" --body "$(cat <<'EOF'
## Summary
- Family B final sweep — pure DS-token swap of the standalone unauthenticated /login page (103 LOC).
- Replace slate/indigo/red Tailwind palette with DS tokens (background / foreground / muted-foreground / primary / card / border / danger-soft / danger-strong / danger-ink).
- Replace raw <input> with shadcn <Input> (×2).
- Replace raw <button> + inline spinner SVG with shadcn <Button> + lucide <Loader2>.
- Replace inline warning SVG with lucide <AlertCircle>.
- Add role="alert" on error block for screen readers.
- No structural changes — page stays standalone full-screen with max-w-sm card.

## Out of scope
- File location refactor (src/LoginPage.jsx → src/pages/LoginPage.jsx).
- Social auth / SSO / "forgot password" / "remember me".
- Final .btn-primary / .btn-ghost / .btn-danger-ghost cleanup in src/index.css — those classes are still used in clients/tasks/teams detail tabs and slide-outs (verified via grep). Cleanup must wait for the deferred detail-tab + modal sweep.
- Auth security migration — separate backlog spec at docs/superpowers/specs/2026-04-27-auth-security-migration-design.md (not part of this PR).

## Test plan
- [x] npm run build clean
- [x] npm test -- --run 235/235 green (no new tests — purely presentational)
- [x] Browser preview /: page renders with DS tokens, shadcn Input + Button visible
- [x] Browser preview /: invalid credentials → error block uses lucide AlertCircle + danger DS tokens, role=alert present
- [x] Browser preview /: submit click → loader2 spinner appears mid-submission

Spec: docs/superpowers/specs/2026-04-27-crm-subplan-6a10-loginpage-repaint-design.md
Plan: docs/superpowers/plans/2026-04-27-crm-subplan-6a10-loginpage-repaint.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed (e.g. `https://github.com/clubmonaco2017-ops/operator-dashboard/pull/<n>`).

- [ ] **Step 4: Switch GitHub user back**

Run: `gh auth switch --user temashdesign`
Expected: `✓ Switched active account for github.com to temashdesign`.

- [ ] **Step 5: Update DS rollout roadmap memory after merge**

After PR merges, update `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`:
- Add `- 6A10 (LoginPage repaint): pure token swap of standalone /login page; lucide AlertCircle + Loader2; shadcn Input + Button` to Done list.
- Strike `LoginPage` out of Family B (Family B fully complete).
- Note that the next deferred work item (detail-tab + modal DS swap) precedes the `.btn-*` CSS cleanup.

---

## Self-review

**Spec coverage:**
- §1 in-scope (11 token replacements + raw `<input>` × 2 + raw `<button>` + 2 inline SVGs + role="alert"): all covered by Task 1's full file replacement ✓.
- §1 out-of-scope (file location refactor / SSO / forgot password / `.btn-*` CSS cleanup / auth security): explicitly excluded from plan ✓.
- §3 behaviour contracts (onLogin contract / busy gate / autoFocus / required attrs / error lifecycle): preserved verbatim in the rewritten file ✓.
- §4 acceptance criteria: build clean (Task 1 step 2) ✓; 235/235 tests (Task 1 step 3) ✓; no new lint warnings (Task 1 step 4) ✓; preview empty/error/loading states (Task 2) ✓.

**Placeholder scan:** no TBD/TODO/"add error handling later". Each step shows full code or full command. Task 2 step 4 has a Russian-language expected error string «Неверный email или пароль» — that's the literal value returned by `auth_login` when no row matches (verified in `src/useAuth.jsx:81`); not a placeholder.

**Type consistency:** only one file modified, no new symbols introduced. `Input` and `Button` imports use the `@/components/ui/input` and `@/components/ui/button` aliases consistent with 6A4-6A9. Lucide icon names match the actual lucide-react exports (`AlertCircle`, `BarChart3`, `Loader2`).
