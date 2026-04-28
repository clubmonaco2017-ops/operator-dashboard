# Auth Security Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the impersonation gap by replacing client-supplied `p_caller_id` with Supabase Auth-verified identity across every RPC, Edge Function, and frontend callsite — without losing test coverage and with a 30-day rollback window.

**Architecture:** Add a SQL helper `current_dashboard_user_id()` that resolves `auth.uid()` → `dashboard_users.id` (filtered by `is_active`). Every privileged RPC drops `p_caller_id` from its signature, derives the caller via the helper, then gates on `has_permission(v_caller_id, ...)`. Frontend swaps the custom `auth_login` flow for `supabase.auth.signInWithPassword`. Big-bang cutover; force-reset all passwords via email; `password_hash` retained 30 days for rollback. Implementation drives bucket-by-bucket (one PR per RPC bucket) following the subagent-driven flow used in 6B-series and 6D.

**Tech Stack:** PostgreSQL 15 + Supabase Auth, React 19, Vite, vitest 1.x + React Testing Library (235 baseline tests), Deno (Edge Functions), Node 20 (migration script).

**Spec:** [`docs/superpowers/specs/2026-04-28-auth-security-migration-design.md`](../specs/2026-04-28-auth-security-migration-design.md). Read it before executing — this plan assumes the architectural decisions in §1 of the spec.

---

## Stages overview

| Stage | What | PR boundary |
|---|---|---|
| 0 | Branch + baseline | — |
| 1 | DB foundation (link column + helper + `get_current_user_profile`) | combined |
| 2 | Frontend `useAuth` rewrite + `LoginPage` + `SetPasswordPage` | with Stage 1 |
| 3 | Migration script + dev rehearsal | with Stage 1 |
| 4 | Security regression test infrastructure | with Stage 1 |
| 5 | Bucket: permissions / attributes | own PR |
| 6 | Bucket: clients CRUD | own PR |
| 7 | Bucket: client media | own PR |
| 8 | Bucket: tasks CRUD | own PR |
| 9 | Bucket: teams CRUD | own PR |
| 10 | Bucket: staff | own PR |
| 11 | Bucket: deletion workflow | own PR |
| 12 | Bucket: dashboard counters | own PR |
| 13 | Edge Functions (admin/agency/platform) | own PR |
| 14 | Cleanup: anon-grant audit + drop `auth_login` | own PR |
| 15 | Cutover playbook (manual, prod) | — |
| 16 | +30d follow-up: drop `password_hash` column | own PR |

---

## Conventions used by every task

**Migration filenames** use the prefix `2026MMDD_NN_` matching existing files in `db/migrations/`. NN continues from the last existing index (currently `20260428_34_staff_avatars.sql`).

**Apply migrations on dev** with: `psql "$DEV_DB_URL" -f db/migrations/<file>.sql`. The repo's existing tooling (or `supabase db push` / `npx supabase migration up`, whichever the project uses) is acceptable; commands below show `psql` for clarity.

**Run unit tests** with: `npm test` (vitest, ~3 s on this repo). Baseline 235/235.

**Run security tests** with: `npm run test:security` (added in Stage 4; integration against dev Supabase, not in `npm test`).

**Commit messages** follow the existing convention: `feat(auth):`, `feat(rpc):`, `chore(migrate):`, etc. Each commit is signed with the project's standard `Co-Authored-By:` trailer.

---

## Bucket Migration Template (§B)

Stages 5–12 each apply this template to a list of RPCs in their bucket. Read this once; bucket stages reference it.

### B.1 SQL migration — pattern per RPC

For each RPC `<name>(p_caller_id integer, ...rest)`:

```sql
-- DROP old signature first; PostgreSQL identifies functions by signature.
DROP FUNCTION IF EXISTS public.<name>(integer, <rest types>);

CREATE OR REPLACE FUNCTION public.<name>(<rest>)
RETURNS <return type>
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  -- existing body, but every `p_caller_id` reference rewritten to `v_caller_id`.
  -- existing has_permission(p_caller_id, '...') becomes has_permission(v_caller_id, '...').
END;
$$;

-- DROP cleared all grants. Re-grant only to authenticated.
GRANT EXECUTE ON FUNCTION public.<name>(<rest>) TO authenticated;
```

For RPCs that **already** lack `p_caller_id` (e.g. `get_user_attributes(p_user_id integer)` — `p_user_id` is the subject, not the caller):

```sql
-- Signature unchanged; old GRANT to anon is still live until explicitly revoked.
REVOKE EXECUTE ON FUNCTION public.<name>(<sig>) FROM anon;
GRANT EXECUTE ON FUNCTION public.<name>(<sig>) TO authenticated;
```

### B.2 Frontend callsite sweep — pattern

For each `.jsx` / `.js` file that calls one of the bucket's RPCs:

```diff
- supabase.rpc('<rpc_name>', { p_caller_id: user.id, /* other params */ })
+ supabase.rpc('<rpc_name>', { /* other params */ })
```

If `user.id` is no longer used after the sweep, delete the unused destructure / prop. If a component received `currentUser` solely to forward `caller_id`, the prop becomes unused — remove the prop from the component signature and from each callsite that passed it.

### B.3 Mock updates — pattern

Each affected unit test (in `src/**/*.test.{js,jsx}`) likely has a mock like:

```js
vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: ..., error: null });
```

If the test asserts on call args (`expect(supabase.rpc).toHaveBeenCalledWith('list_clients', { p_caller_id: 7, p_status: 'active' })`), update the expected payload to drop `p_caller_id`.

If the test doesn't assert on args — leave it.

### B.4 Verification — pattern

After each bucket:

1. `npm test` → 235/235 green.
2. `npm run test:security` → previously-failing assertions for this bucket now pass; previously-passing assertions still pass.
3. `grep -rEn "p_caller_id" db/migrations/ | grep -v "^db/migrations/.*before"` → bucket's RPCs no longer match.
4. `grep -rEn "p_caller_id|caller_id" <bucket's frontend files>` → 0 matches in those files.

### B.5 Commit + PR — pattern

```bash
git add db/migrations/<new file> src/<callsite files> src/<test files>
git commit -m "feat(rpc): migrate <bucket name> RPCs to current_dashboard_user_id() helper"
git push -u origin feat/auth-security-migration
gh pr create --title "feat(auth): bucket — <bucket name>" --body "$(cat <<'EOF'
Part of the Auth Security Migration. Migrates the <bucket name> RPC bucket to use `current_dashboard_user_id()` instead of accepting `p_caller_id` from the client.

## Summary
- Migrated <N> RPCs (<list>) — see commit for diff.
- Updated <M> frontend callsite files (<list>).
- Updated <K> mock files (<list>).
- 235/235 vitest green; security regression suite shows reduced failure count for this bucket's RPCs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Stage 0 — Branch + baseline

### Task 0.1: Create branch and verify clean baseline

**Files:** none modified

- [ ] **Step 1: Branch off main**

```bash
git checkout main
git pull
git checkout -b feat/auth-security-migration
```

- [ ] **Step 2: Run baseline tests**

```bash
npm test
```

Expected: `Tests  235 passed (235)` — all green. If less, stop and investigate; do not proceed.

- [ ] **Step 3: Record baseline grep counts**

```bash
echo "src callsites: $(grep -rln 'p_caller_id\|caller_id' src/ --include='*.js' --include='*.jsx' | wc -l)"
echo "migration files with p_caller_id: $(grep -rln 'p_caller_id' db/migrations/ | wc -l)"
echo "supabase functions with caller_id: $(grep -rln 'caller_id' supabase/ 2>/dev/null | wc -l)"
```

Expected output (record this — it's the "before" snapshot):
- `src callsites: 39`
- `migration files with p_caller_id: 17`
- `supabase functions with caller_id: 0` (project's edge fns may not be in repo; will discover in Stage 13)

- [ ] **Step 4: Confirm dev Supabase URL is set**

```bash
echo "$VITE_SUPABASE_URL" | grep akpddaqpggktefkdecrl
```

Expected: prints `https://akpddaqpggktefkdecrl.supabase.co`. If empty, source the dev `.env.local` first.

- [ ] **Step 5: No commit yet** — branch creation is the only state change; rest is verification.

---

## Stage 1 — DB foundation

PR boundary: combined with Stage 2 and Stage 3.

### Task 1.1: Migration — `dashboard_users.auth_user_id` link column

**Files:**
- Create: `db/migrations/20260428_35_auth_user_id_link.sql`

- [ ] **Step 1: Write migration**

```sql
-- 35: Link dashboard_users to Supabase Auth identities.
-- Phase 1 of auth security migration. NULL allowed initially;
-- scripts/migrate-users-to-supabase-auth.mjs populates at cutover.

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dashboard_users_auth_user_id_idx
  ON public.dashboard_users(auth_user_id);

COMMENT ON COLUMN public.dashboard_users.auth_user_id IS
  'FK to auth.users. NULL means user not yet migrated; legacy login still possible during the migration window. Populated by scripts/migrate-users-to-supabase-auth.mjs at cutover.';
```

- [ ] **Step 2: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_35_auth_user_id_link.sql
```

Expected: `ALTER TABLE` / `CREATE INDEX` / `COMMENT` — no errors.

- [ ] **Step 3: Verify column exists**

```bash
psql "$DEV_DB_URL" -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='dashboard_users' AND column_name='auth_user_id';"
```

Expected: one row, `auth_user_id | uuid | YES`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260428_35_auth_user_id_link.sql
git commit -m "feat(auth): add dashboard_users.auth_user_id link column

Phase 1 of auth security migration. NULL allowed initially; populated by
the migration script at cutover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.2: Migration — `current_dashboard_user_id()` helper function

**Files:**
- Create: `db/migrations/20260428_36_current_dashboard_user_id.sql`

- [ ] **Step 1: Write migration**

```sql
-- 36: Helper function for resolving auth.uid() to dashboard_users.id.
-- Returns NULL when caller is anonymous, has no link, or is deactivated.
-- Every migrated RPC begins with `v_caller_id := current_dashboard_user_id();`
-- and raises 'unauthorized' on NULL.

CREATE OR REPLACE FUNCTION public.current_dashboard_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id FROM public.dashboard_users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_dashboard_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_dashboard_user_id() TO authenticated;

COMMENT ON FUNCTION public.current_dashboard_user_id() IS
  'Single source of truth for caller identity. Returns dashboard_users.id for the JWT-authenticated active user, or NULL for anon / unlinked / deactivated.';
```

- [ ] **Step 2: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_36_current_dashboard_user_id.sql
```

Expected: `CREATE FUNCTION` / `REVOKE` / `GRANT` / `COMMENT`.

- [ ] **Step 3: Sanity-check anon path**

```bash
psql "$DEV_DB_URL" -c "SET ROLE anon; SELECT public.current_dashboard_user_id(); RESET ROLE;"
```

Expected: returns NULL (anon has no `auth.uid()`). Note: `SET ROLE anon` requires `psql` connected as superuser; if it errors out with "permission denied", the function is correctly defined — proceed.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260428_36_current_dashboard_user_id.sql
git commit -m "feat(auth): add current_dashboard_user_id() helper

Resolves auth.uid() to dashboard_users.id, filtered by is_active.
Becomes the single source of truth for caller identity in every
migrated RPC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 1.3: Migration — `get_current_user_profile()` hydration RPC

**Files:**
- Create: `db/migrations/20260428_37_get_current_user_profile.sql`

- [ ] **Step 1: Write migration**

```sql
-- 37: Hydration RPC. Replaces the user-profile half of legacy auth_login.
-- Returns the current user row + permissions array + attributes; called by
-- useAuth after every onAuthStateChange.

CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id integer,
  email text,
  first_name text,
  last_name text,
  role text,
  is_active boolean,
  permissions text[],
  attributes jsonb,
  timezone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    COALESCE(
      (SELECT array_agg(p.permission ORDER BY p.permission)
       FROM public.user_permissions p
       WHERE p.user_id = u.id),
      ARRAY[]::text[]
    ),
    COALESCE(
      (SELECT jsonb_object_agg(a.key, a.value)
       FROM public.user_attributes a
       WHERE a.user_id = u.id),
      '{}'::jsonb
    ),
    u.timezone
  FROM public.dashboard_users u
  WHERE u.id = v_caller_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;
```

> **Note:** if the actual columns of `dashboard_users` / `user_permissions` / `user_attributes` differ from the assumed shape above, adjust the SELECT to match. Use `psql "$DEV_DB_URL" -c "\d public.dashboard_users"` to introspect before writing.

- [ ] **Step 2: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_37_get_current_user_profile.sql
```

Expected: `CREATE FUNCTION`, no errors.

- [ ] **Step 3: Smoke-test under a real session (deferred)**

Cannot smoke-test until Stage 3 creates a Supabase Auth user. Verification deferred to Task 3.4.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260428_37_get_current_user_profile.sql
git commit -m "feat(auth): add get_current_user_profile() hydration RPC

Replaces the user-profile half of the legacy auth_login flow. Called by
useAuth after every onAuthStateChange to populate user/permissions state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Stage 2 — Frontend: `useAuth` + login + set-password

### Task 2.1: Rewrite `src/useAuth.jsx`

**Files:**
- Modify: `src/useAuth.jsx` (full rewrite — read current shape first via `Read`)

- [ ] **Step 1: Read current shape**

```bash
cat src/useAuth.jsx
```

Note the exported names (`useAuth`, default-export Provider, etc.) and the `user` object shape consumed elsewhere — match these exactly so callsites don't need changes beyond Stage 5+ sweeps.

- [ ] **Step 2: Replace file contents**

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({ session: null, user: null, loading: true, signIn: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initial session + subscribe.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Hydrate dashboard_users profile on every session change.
  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc('get_current_user_profile')
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('get_current_user_profile failed', error);
          setUser(null);
        } else {
          setUser(data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Run typecheck / build smoke**

```bash
npm run build
```

Expected: build succeeds. Errors here usually mean a consumer expected a field on `user` that was renamed — fix by aligning the field name in `get_current_user_profile()` to match what consumers expect.

- [ ] **Step 4: Run unit tests**

```bash
npm test
```

Expected: all 235 tests still pass. Some `useAuth`-mocking tests may need their mock shape updated — adjust their `vi.mocked(useAuth).mockReturnValue(...)` calls so the returned object includes `session`, `user`, `loading`, `signIn`, `signOut`. If tests fail, fix mocks; do not regress count.

- [ ] **Step 5: Commit**

```bash
git add src/useAuth.jsx src/**/*.test.{js,jsx}
git commit -m "feat(auth): rewrite useAuth on top of Supabase Auth

Subscribe to onAuthStateChange instead of caching auth_login response in
localStorage. Hydrate dashboard_users profile via get_current_user_profile()
RPC after every session change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.2: Rewrite `src/LoginPage.jsx`

**Files:**
- Modify: `src/LoginPage.jsx` (read first, preserve existing visual styling/translations)

- [ ] **Step 1: Read current file**

```bash
cat src/LoginPage.jsx
```

Identify the form structure, error-display element, and styling classes. Keep all of these; replace only the auth call.

- [ ] **Step 2: Replace login submit handler**

The current handler calls `supabase.rpc('auth_login', { p_email, p_password })`. Replace with `useAuth().signIn(email, password)`. Russian error mapping:

```jsx
async function handleSubmit(e) {
  e.preventDefault();
  setError('');
  setSubmitting(true);
  const { error } = await signIn(email, password);
  setSubmitting(false);
  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      setError('Неверный email или пароль');
    } else if (error.message.includes('Email not confirmed')) {
      setError('Email не подтверждён. Проверьте почту.');
    } else {
      setError('Ошибка входа. Попробуйте позже.');
    }
    return;
  }
  // session set by AuthProvider; navigate('/') happens via auth-aware Router.
}
```

- [ ] **Step 3: Add "forgot password" link**

Below the submit button:

```jsx
<button
  type="button"
  className="text-sm text-muted-foreground hover:text-foreground transition"
  onClick={async () => {
    if (!email) {
      setError('Введите email, чтобы получить ссылку для сброса.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    if (error) {
      setError('Не удалось отправить письмо. Попробуйте позже.');
    } else {
      setError('');
      setNotice('Письмо со ссылкой отправлено на ' + email);
    }
  }}
>
  Забыли пароль?
</button>
```

(Add `notice` state alongside `error`.)

- [ ] **Step 4: Run unit tests**

```bash
npm test -- LoginPage
```

Expected: existing LoginPage tests pass after their `supabase.rpc('auth_login', ...)` mock is replaced with `vi.mocked(useAuth).mockReturnValue({ signIn: vi.fn().mockResolvedValue({ error: null }), ... })`.

- [ ] **Step 5: Commit**

```bash
git add src/LoginPage.jsx src/**/*.test.{js,jsx}
git commit -m "feat(auth): swap LoginPage to supabase.auth.signInWithPassword

+ Russian error mapping
+ Forgot-password link wiring resetPasswordForEmail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.3: Create `src/SetPasswordPage.jsx`

**Files:**
- Create: `src/SetPasswordPage.jsx`
- Create: `src/SetPasswordPage.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// src/SetPasswordPage.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SetPasswordPage from './SetPasswordPage';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}));

describe('SetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects passwords shorter than 8 chars', async () => {
    render(<MemoryRouter><SetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() => expect(screen.getByText(/не менее 8/i)).toBeInTheDocument());
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser with valid password and shows success', async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    render(<MemoryRouter><SetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'longenoughpw' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- SetPasswordPage
```

Expected: FAIL — module `./SetPasswordPage` not found.

- [ ] **Step 3: Implement `SetPasswordPage.jsx`**

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов.');
      return;
    }
    setSubmitting(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateErr) {
      setError('Не удалось сохранить пароль. Ссылка могла истечь — запросите новую через «Забыли пароль?» на странице входа.');
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/'), 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Задайте пароль</h1>
        {done ? (
          <p className="text-sm text-muted-foreground">Готово. Перенаправляем…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- SetPasswordPage
```

Expected: 2/2 tests pass.

- [ ] **Step 5: Wire route in `src/App.jsx`**

```diff
+ import SetPasswordPage from './SetPasswordPage';
  ...
  <Routes>
    ...
    <Route path="/login" element={<LoginPage />} />
+   <Route path="/set-password" element={<SetPasswordPage />} />
    ...
  </Routes>
```

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: 237/237 (235 existing + 2 new).

- [ ] **Step 7: Commit**

```bash
git add src/SetPasswordPage.jsx src/SetPasswordPage.test.jsx src/App.jsx
git commit -m "feat(auth): add /set-password landing page

Used by recovery email links from migration script and forgot-password
flow. Validates 8+ char password, calls supabase.auth.updateUser, redirects
to / on success.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Stage 3 — Migration script + dev rehearsal

### Task 3.1: Write `scripts/migrate-users-to-supabase-auth.mjs`

**Files:**
- Create: `scripts/migrate-users-to-supabase-auth.mjs`

- [ ] **Step 1: Verify env vars available**

```bash
echo "URL: ${SUPABASE_URL:0:30}..."
echo "SERVICE_ROLE: ${SUPABASE_SERVICE_ROLE_KEY:0:10}..."
```

Both must be non-empty. If missing, source `.env.local.dev` (or wherever the project keeps service-role).

- [ ] **Step 2: Write script**

```js
#!/usr/bin/env node
// scripts/migrate-users-to-supabase-auth.mjs
//
// Idempotent. Re-runnable. Skips inactive users; skips users already linked.
// For each active dashboard_users row:
//   1. Find or create matching auth.users row (no password set).
//   2. Update dashboard_users.auth_user_id with that row's UUID.
//   3. Generate a recovery link → triggers "set your password" email.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findExistingAuthUser(email) {
  // listUsers is paginated; iterate until we either find or exhaust.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

async function main() {
  const { data: users, error: listErr } = await admin
    .from('dashboard_users')
    .select('id, email, is_active, auth_user_id')
    .eq('is_active', true);
  if (listErr) {
    console.error('Failed to read dashboard_users:', listErr.message);
    process.exit(1);
  }

  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;

  for (const u of users) {
    if (u.auth_user_id) {
      console.log(`SKIP ${u.email} (already linked)`);
      skipCount += 1;
      continue;
    }
    if (!u.email) {
      console.log(`ERR  user_id=${u.id} has no email — skipping`);
      errCount += 1;
      continue;
    }

    let authUserId = await findExistingAuthUser(u.email);
    if (!authUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        email_confirm: true,
      });
      if (error) {
        console.log(`ERR  ${u.email}: ${error.message}`);
        errCount += 1;
        continue;
      }
      authUserId = data.user.id;
    }

    const { error: linkErr } = await admin
      .from('dashboard_users')
      .update({ auth_user_id: authUserId })
      .eq('id', u.id);
    if (linkErr) {
      console.log(`ERR  ${u.email} link: ${linkErr.message}`);
      errCount += 1;
      continue;
    }

    const { error: linkSendErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: u.email,
    });
    if (linkSendErr) {
      console.log(`WARN ${u.email} recovery link: ${linkSendErr.message} (linked, but email not sent)`);
    }

    console.log(`OK   ${u.email} → ${authUserId}`);
    okCount += 1;
  }

  console.log(`\nDone. ok=${okCount} skipped=${skipCount} errors=${errCount} total=${users.length}`);
  if (errCount > 0) process.exit(2);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
```

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/migrate-users-to-supabase-auth.mjs
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-users-to-supabase-auth.mjs
git commit -m "feat(auth): add idempotent user migration script

One-shot Node script. Active dashboard_users rows → auth.users records,
links via auth_user_id, dispatches 'set your password' recovery email.
Re-runnable; skips already-linked users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.2: Write `scripts/seed-test-users.mjs` (security-suite fixtures)

**Files:**
- Create: `scripts/seed-test-users.mjs`

- [ ] **Step 1: Write script**

```js
#!/usr/bin/env node
// scripts/seed-test-users.mjs
//
// Idempotent. Creates / refreshes three test users used by tests/security/.
// userA: regular operator, has create_clients permission
// userB: regular operator, no special permissions
// userC: regular operator (deactivation target in tests)
// Each user has a Supabase Auth row with a known password.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_ROLE) { console.error('Missing env'); process.exit(1); }

const admin = createClient(URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

const FIXTURES = [
  { email: 'userA@test.local', password: 'TestPwUserA1', role: 'operator', perms: ['list_clients', 'create_clients'] },
  { email: 'userB@test.local', password: 'TestPwUserB1', role: 'operator', perms: [] },
  { email: 'userC@test.local', password: 'TestPwUserC1', role: 'operator', perms: ['list_clients'] },
];

async function findOrCreateAuthUser({ email, password }) {
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

async function findOrCreateDashboardUser({ email, role, authUserId }) {
  const { data: existing } = await admin.from('dashboard_users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    await admin.from('dashboard_users').update({ auth_user_id: authUserId, is_active: true, role }).eq('id', existing.id);
    return existing.id;
  }
  const { data: created, error } = await admin
    .from('dashboard_users')
    .insert({ email, role, is_active: true, auth_user_id: authUserId, first_name: email.split('@')[0], last_name: 'Test' })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

async function setPermissions(dashboardUserId, perms) {
  await admin.from('user_permissions').delete().eq('user_id', dashboardUserId);
  if (perms.length > 0) {
    await admin.from('user_permissions').insert(perms.map((p) => ({ user_id: dashboardUserId, permission: p })));
  }
}

async function main() {
  for (const f of FIXTURES) {
    const authUserId = await findOrCreateAuthUser(f);
    const dashboardId = await findOrCreateDashboardUser({ ...f, authUserId });
    await setPermissions(dashboardId, f.perms);
    console.log(`OK ${f.email} (auth=${authUserId} dashboard=${dashboardId})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
chmod +x scripts/seed-test-users.mjs
git add scripts/seed-test-users.mjs
git commit -m "test(auth): add seed-test-users.mjs for security suite fixtures

Idempotent. Creates userA/B/C with known passwords + permission sets used
by tests/security/auth-gate.spec.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.3: Run dev rehearsal

**Files:** none modified

- [ ] **Step 1: Run the migration script on dev**

```bash
node scripts/migrate-users-to-supabase-auth.mjs
```

Expected: prints `OK <email>` per active user; ends with `Done. ok=N skipped=0 errors=0 total=N`.

- [ ] **Step 2: Verify all active users linked**

```bash
psql "$DEV_DB_URL" -c "SELECT count(*) FROM public.dashboard_users WHERE is_active AND auth_user_id IS NULL;"
```

Expected: `0`.

- [ ] **Step 3: Verify auth.users have email_confirmed_at**

```bash
psql "$DEV_DB_URL" -c "SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NULL;"
```

Expected: `0`.

- [ ] **Step 4: Re-run script (idempotency check)**

```bash
node scripts/migrate-users-to-supabase-auth.mjs
```

Expected: every line prints `SKIP ... (already linked)`; `errors=0`.

- [ ] **Step 5: Seed test users**

```bash
node scripts/seed-test-users.mjs
```

Expected: 3 lines `OK userA/B/C@test.local ...`.

- [ ] **Step 6: Manual smoke — log in via /login as userA**

Open browser: dev URL `/login`. Email `userA@test.local`, password `TestPwUserA1`. Submit. Expected: redirected to `/`. `useAuth().user.email === 'userA@test.local'` (verify via React DevTools or a `console.log`).

This validates `signInWithPassword` + `get_current_user_profile` end-to-end.

- [ ] **Step 7: No commit** — Stage 3 produces only DB state on dev, no code changes.

### Task 3.4: Smoke-test `get_current_user_profile()`

**Files:** none modified

- [ ] **Step 1: Get userA's auth_user_id**

```bash
psql "$DEV_DB_URL" -c "SELECT id, email, auth_user_id FROM public.dashboard_users WHERE email='userA@test.local';"
```

Record the `auth_user_id` UUID.

- [ ] **Step 2: Call RPC with a real session token**

Easiest path: in the browser DevTools console, after logging in as userA:

```js
const { data, error } = await window.supabase.rpc('get_current_user_profile').single();
console.log({ data, error });
```

Expected: `data.email === 'userA@test.local'`, `data.permissions` includes `'list_clients'` and `'create_clients'`, `error === null`.

If `data` is null and error is `unauthorized`, the helper isn't resolving — re-check `dashboard_users.auth_user_id` is set and `is_active` is true.

- [ ] **Step 3: No commit**

---

## Stage 4 — Security regression test infrastructure

### Task 4.1: Add `npm run test:security` script + folder

**Files:**
- Modify: `package.json`
- Create: `tests/security/.gitkeep`
- Create: `tests/security/helpers.ts`

- [ ] **Step 1: Add npm script**

In `package.json` `scripts`:

```diff
   "scripts": {
     "test": "vitest run",
+    "test:security": "vitest run --config vitest.security.config.ts",
     ...
   }
```

- [ ] **Step 2: Create vitest config for security tests**

Create `vitest.security.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/security/**/*.spec.{ts,tsx}'],
    environment: 'node',
    testTimeout: 15000,
    setupFiles: ['tests/security/setup.ts'],
  },
});
```

- [ ] **Step 3: Create `tests/security/setup.ts`**

```ts
// Loaded before each security test. Verifies env present.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Security tests require SUPABASE_URL and SUPABASE_ANON_KEY (dev project, NOT prod).');
}
if (process.env.SUPABASE_URL.includes('akpddaqpggktefkdecrl') === false) {
  throw new Error('Refusing to run security tests against non-dev project. Edit setup.ts to allow other dev URLs.');
}
```

- [ ] **Step 4: Create `tests/security/helpers.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;

export function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signInAs(email: string, password: string) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

export async function adminSetActive(dashboardUserId: number, isActive: boolean) {
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.from('dashboard_users').update({ is_active: isActive }).eq('id', dashboardUserId);
  if (error) throw error;
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.security.config.ts tests/security/
git commit -m "test(security): scaffold integration test runner

npm run test:security runs against dev Supabase. setup.ts hard-blocks
prod URL. helpers.ts provides anonClient + signInAs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.2: Write `tests/security/auth-gate.spec.ts`

**Files:**
- Create: `tests/security/auth-gate.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { anonClient, signInAs, adminSetActive } from './helpers';
import { createClient } from '@supabase/supabase-js';

const ALL_RPCS_REQUIRING_AUTH = [
  // List populated as buckets migrate. At end of Stage 14 every privileged RPC is here.
  'list_clients', 'list_tasks', 'list_teams', 'list_staff',
  'create_client', 'update_client', 'archive_client', 'restore_client',
  'create_task', 'update_task', 'cancel_task', 'delete_task',
  'create_team', 'update_team', 'archive_team', 'restore_team',
  'create_staff', 'update_staff_profile', 'deactivate_staff',
  'add_team_member', 'remove_team_member', 'move_team_member',
  'assign_team_clients', 'unassign_team_client', 'move_team_client',
  'add_client_media', 'update_client_media', 'delete_client_media', 'reorder_client_media',
  'submit_task_report', 'update_task_report', 'take_task_in_progress',
  'request_deletion', 'approve_deletion', 'reject_deletion',
  'count_overdue_tasks', 'count_pending_deletions',
  'set_user_attribute', 'delete_user_attribute',
  'grant_permission', 'revoke_permission',
  'set_operator_curator', 'bulk_assign_curated_operators',
  'get_current_user_profile',
];

let userAId: number;

beforeAll(async () => {
  // Resolve userA's dashboard_users.id once.
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin.from('dashboard_users').select('id').eq('email', 'userA@test.local').single();
  userAId = data!.id;
});

describe('anon caller', () => {
  it('cannot read dashboard_users directly', async () => {
    const anon = anonClient();
    const { error } = await anon.from('dashboard_users').select('id').limit(1);
    expect(error).toBeTruthy();
  });

  it.each(ALL_RPCS_REQUIRING_AUTH)('cannot call RPC %s', async (rpcName) => {
    const anon = anonClient();
    const { error } = await anon.rpc(rpcName, {});
    expect(error).toBeTruthy();
    // PGRST202 = function not found in schema cache. We DO NOT want that —
    // would mean the test is calling a non-existent function and silently
    // "passing".
    expect(error!.code).not.toBe('PGRST202');
  });
});

describe('authenticated caller', () => {
  it('cannot impersonate by passing arbitrary p_caller_id', async () => {
    const sessionA = await signInAs('userA@test.local', 'TestPwUserA1');
    // After migration, list_clients no longer accepts p_caller_id.
    // PostgREST returns a function-signature error.
    const { error } = await sessionA.rpc('list_clients', { p_caller_id: 1 } as any);
    expect(error).toBeTruthy();
    // Either "function does not exist" or "Could not find the function ... in the schema cache":
    expect(/PGRST202|42883|function .* does not exist/i.test(error!.message + error!.code)).toBe(true);
  });

  it('can call list_clients with the correct (param-stripped) signature', async () => {
    const sessionA = await signInAs('userA@test.local', 'TestPwUserA1');
    const { error } = await sessionA.rpc('list_clients', {});
    expect(error).toBeFalsy();
  });

  it('deactivated user fails next call with unauthorized', async () => {
    const sessionC = await signInAs('userC@test.local', 'TestPwUserC1');
    const { data: cRow } = await sessionC.rpc('get_current_user_profile').single();
    expect(cRow).toBeTruthy();
    try {
      await adminSetActive((cRow as any).id, false);
      const { error } = await sessionC.rpc('list_clients', {});
      expect(error).toBeTruthy();
      expect(error!.message).toMatch(/unauthorized/i);
    } finally {
      // Always re-activate so subsequent runs work.
      await adminSetActive((cRow as any).id, true);
    }
  });
});
```

- [ ] **Step 2: Run the suite — record baseline failures**

```bash
npm run test:security
```

Expected at this point: **most "anon cannot call RPC" tests still PASS for now** because anon currently *can* call them (the gap), but the assertion is `error to be truthy` — they correctly fail. So expect a sea of red. Each subsequent bucket migration flips them green incrementally. Record the failure count: this is the "before" baseline.

- [ ] **Step 3: Commit**

```bash
git add tests/security/auth-gate.spec.ts
git commit -m "test(security): add auth-gate regression suite

Currently red (most RPCs not yet migrated). Each bucket flips its share
of these to green. Final cleanup stage gates merge on full green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 4.3: Open the foundation PR

**Files:** none modified

- [ ] **Step 1: Push and open PR for Stages 1–4**

```bash
git push -u origin feat/auth-security-migration
gh pr create --title "feat(auth): foundation — link column + helper + useAuth + migration script + security infra" --body "$(cat <<'EOF'
First PR of the Auth Security Migration. Establishes the full plumbing
without touching any privileged RPCs yet — those follow in bucket PRs.

## Summary
- DB: `dashboard_users.auth_user_id` link column, `current_dashboard_user_id()` helper, `get_current_user_profile()` hydration RPC.
- Frontend: `useAuth` rewritten on `supabase.auth.onAuthStateChange`; `LoginPage` swapped to `signInWithPassword` + Russian error map + forgot-password link; new `/set-password` recovery landing.
- Scripts: idempotent `migrate-users-to-supabase-auth.mjs` (force-reset email per user) + `seed-test-users.mjs` (security fixtures).
- Tests: `npm run test:security` runner + `auth-gate.spec.ts` (currently red — flips green bucket by bucket).

## Test plan
- [x] 235/235 vitest still green (after useAuth + LoginPage mock updates).
- [x] Dev rehearsal: migration script idempotent, all active users linked.
- [x] Manual login as userA on dev works end-to-end.
- [ ] Security suite baseline failure count recorded for diff against later PRs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Stage 5 — Bucket: permissions / attributes

PR boundary: own PR. Apply **Bucket Migration Template (§B)** above to:

**RPCs in this bucket:**
- `grant_permission(p_caller_id integer, p_user_id integer, p_permission text)`
- `revoke_permission(p_caller_id integer, p_user_id integer, p_permission text)`
- `set_user_attribute(p_caller_id integer, p_user_id integer, p_key text, p_value text)`
- `delete_user_attribute(p_caller_id integer, p_user_id integer, p_key text)`
- `get_user_permissions(p_user_id integer)` — **signature unchanged**, only revoke anon + grant authenticated.
- `get_user_attributes(p_user_id integer)` — **signature unchanged**, only revoke anon + grant authenticated.
- `get_user_team_membership(p_user_id integer)` — **signature unchanged**, only revoke anon + grant authenticated.

**Source migration files containing the originals:**
- `db/migrations/20260423_03_user_permissions_table.sql`
- `db/migrations/20260423_04_user_attributes_table.sql`
- `db/migrations/20260423_07_rpc_attributes.sql`

### Task 5.1: Write bucket migration

**Files:**
- Create: `db/migrations/20260428_38_rpc_permissions_attributes_auth.sql`

- [ ] **Step 1: Read each source RPC** to capture the existing body verbatim (you'll re-emit it with only the caller-id swap).

```bash
grep -A 50 "FUNCTION grant_permission" db/migrations/20260423_03_user_permissions_table.sql
# repeat for each of the 7 RPCs above
```

- [ ] **Step 2: Write the migration applying §B.1 to each RPC**

The file groups them in one transaction:

```sql
-- 38: Migrate permissions/attributes RPCs to current_dashboard_user_id() helper.
-- Part of auth security migration. See spec §5.4 bucket "permissions / attributes".

BEGIN;

-- grant_permission --------------------------------------------------------
DROP FUNCTION IF EXISTS public.grant_permission(integer, integer, text);

CREATE OR REPLACE FUNCTION public.grant_permission(
  p_user_id integer,
  p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_permissions') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  INSERT INTO public.user_permissions(user_id, permission)
  VALUES (p_user_id, p_permission)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_permission(integer, text) TO authenticated;

-- revoke_permission -------------------------------------------------------
DROP FUNCTION IF EXISTS public.revoke_permission(integer, integer, text);

CREATE OR REPLACE FUNCTION public.revoke_permission(
  p_user_id integer,
  p_permission text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'manage_permissions') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  DELETE FROM public.user_permissions
  WHERE user_id = p_user_id AND permission = p_permission;
END;
$$;
GRANT EXECUTE ON FUNCTION public.revoke_permission(integer, text) TO authenticated;

-- set_user_attribute ------------------------------------------------------
DROP FUNCTION IF EXISTS public.set_user_attribute(integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.set_user_attribute(
  p_user_id integer,
  p_key text,
  p_value text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'edit_users') AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  INSERT INTO public.user_attributes(user_id, key, value)
  VALUES (p_user_id, p_key, p_value)
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_user_attribute(integer, text, text) TO authenticated;

-- delete_user_attribute ---------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_user_attribute(integer, integer, text);

CREATE OR REPLACE FUNCTION public.delete_user_attribute(
  p_user_id integer,
  p_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'edit_users') AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  DELETE FROM public.user_attributes WHERE user_id = p_user_id AND key = p_key;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_user_attribute(integer, text) TO authenticated;

-- read-only RPCs: signature unchanged; revoke anon + regrant authenticated.
REVOKE EXECUTE ON FUNCTION public.get_user_permissions(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_permissions(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_attributes(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_attributes(integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_team_membership(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_user_team_membership(integer) TO authenticated;

COMMIT;
```

> If the original RPC bodies in the source files differ from the simplified versions above (e.g. they have additional permission gates, audit log inserts, etc.), copy the **exact** body and apply only the `p_caller_id → v_caller_id` rewrite. Don't simplify behaviour silently.

- [ ] **Step 3: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_38_rpc_permissions_attributes_auth.sql
```

Expected: `BEGIN`, multiple `DROP/CREATE/GRANT/REVOKE`, `COMMIT`.

- [ ] **Step 4: Verify signature changes**

```bash
psql "$DEV_DB_URL" -c "\df public.grant_permission"
psql "$DEV_DB_URL" -c "\df public.set_user_attribute"
```

Expected: shows new signatures (without `p_caller_id integer`).

### Task 5.2: Sweep frontend callsites for this bucket

**Files (modify):**
- `src/sections/PermissionsSection.jsx` (if present)
- any file matching `grep -rln 'grant_permission\|revoke_permission\|set_user_attribute\|delete_user_attribute\|get_user_permissions\|get_user_attributes\|get_user_team_membership' src/`

- [ ] **Step 1: Find callsites**

```bash
grep -rln 'grant_permission\|revoke_permission\|set_user_attribute\|delete_user_attribute' src/ --include='*.jsx' --include='*.js'
```

- [ ] **Step 2: Apply §B.2 to each match**

Drop `p_caller_id: ...` from the second arg object of each `supabase.rpc(...)` call.

- [ ] **Step 3: Run typecheck + tests**

```bash
npm test
```

Expected: 237/237 green. If a test asserts on payload shape and fails — apply §B.3 to that test (drop `p_caller_id` from expected args).

### Task 5.3: Run security suite

- [ ] **Step 1: Run**

```bash
npm run test:security
```

Expected: assertions for `grant_permission`, `revoke_permission`, `set_user_attribute`, `delete_user_attribute`, `get_user_permissions`, `get_user_attributes`, `get_user_team_membership` are now green (anon gets error). Other RPCs still red — that's expected, they migrate in later buckets.

### Task 5.4: Commit and open PR

- [ ] **Step 1: Commit**

```bash
git add db/migrations/20260428_38_rpc_permissions_attributes_auth.sql src/
git commit -m "feat(rpc): migrate permissions/attributes bucket to current_dashboard_user_id()

Bucket 1 of 8 in the auth security migration. Migrates 4 mutating RPCs
(grant_permission, revoke_permission, set_user_attribute, delete_user_attribute)
and revokes anon access on 3 read-only RPCs (get_user_permissions,
get_user_attributes, get_user_team_membership).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Push + open PR (per §B.5)**

```bash
git push
gh pr create --title "feat(auth): bucket — permissions/attributes" --body "..."
```

---

## Stage 6 — Bucket: clients CRUD

PR boundary: own PR. Apply **Bucket Migration Template (§B)** to:

**RPCs in this bucket:**
- `create_client(p_caller_id, ...)`
- `update_client(p_caller_id, ...)`
- `archive_client(p_caller_id, ...)`
- `restore_client(p_caller_id, ...)`
- `list_clients(p_caller_id, ...)`
- `get_client_detail(p_caller_id, ...)`
- `list_client_activity(p_caller_id, ...)`
- `list_unassigned_clients(p_caller_id, ...)`

**Source migration:** `db/migrations/20260425_14_rpc_client_crud.sql`

### Task 6.1: Bucket migration file

**Files:**
- Create: `db/migrations/20260428_39_rpc_clients_crud_auth.sql`

- [ ] **Step 1: Read each source RPC body** verbatim:

```bash
grep -A 80 "FUNCTION create_client" db/migrations/20260425_14_rpc_client_crud.sql
# repeat for each
```

- [ ] **Step 2: Write migration applying §B.1 per RPC**

Same structure as Task 5.1 — `BEGIN; ... COMMIT;` block, one DROP+CREATE+GRANT triple per RPC. For each: drop `p_caller_id integer` from signature, declare `v_caller_id integer := current_dashboard_user_id();` at top, swap `p_caller_id` → `v_caller_id` everywhere in the body, regrant to `authenticated` only.

- [ ] **Step 3: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_39_rpc_clients_crud_auth.sql
```

### Task 6.2: Sweep frontend callsites

**Files (modify):**
Find with: `grep -rln 'create_client\b\|update_client\b\|archive_client\|restore_client\|list_clients\|get_client_detail\|list_client_activity\|list_unassigned_clients' src/ --include='*.jsx' --include='*.js'`

Likely: `src/clients/*.jsx` family + `src/hooks/useClients*.js`.

- [ ] **Step 1: Apply §B.2 (drop `p_caller_id` from each `supabase.rpc(...)` second arg)**.

- [ ] **Step 2: Apply §B.3 to affected test mocks**.

- [ ] **Step 3: `npm test`** → 237/237 green.

### Task 6.3: Run security suite + commit + PR (per §B.4 / §B.5)

- [ ] **Step 1: `npm run test:security`** — verify 8 more RPCs flip green.

- [ ] **Step 2: Commit + PR**, message: `feat(rpc): migrate clients CRUD bucket to current_dashboard_user_id()`.

---

## Stage 7 — Bucket: client media

PR boundary: own PR. Apply **§B** to:

**RPCs:**
- `add_client_media(p_caller_id, ...)`
- `update_client_media(p_caller_id, ...)`
- `delete_client_media(p_caller_id, ...)`
- `reorder_client_media(p_caller_id, ...)`
- `list_client_media(p_caller_id, ...)`

**Source migration:** `db/migrations/20260425_15_rpc_client_media.sql`

### Task 7.1: Bucket migration

**Files:** Create `db/migrations/20260428_40_rpc_client_media_auth.sql`.

- [ ] **Step 1–3: Same flow as Task 5.1** — read source bodies, emit migration, apply on dev.

### Task 7.2: Sweep callsites

Find via `grep -rln 'add_client_media\|update_client_media\|delete_client_media\|reorder_client_media\|list_client_media' src/`.

Likely: `src/clients/PhotoGalleryTab.jsx`, `src/clients/VideoGalleryTab.jsx`, `src/clients/ClientLightbox.jsx`, `src/clients/MediaSlideOut.jsx`.

- [ ] **Step 1: Apply §B.2 + §B.3**.
- [ ] **Step 2: `npm test`** → green.

### Task 7.3: Security + commit + PR

- [ ] **Step 1: `npm run test:security`**.
- [ ] **Step 2: Commit + PR**, message: `feat(rpc): migrate client-media bucket to current_dashboard_user_id()`.

---

## Stage 8 — Bucket: tasks CRUD

**RPCs:**
- `create_task`, `update_task`, `cancel_task`, `delete_task`
- `list_tasks`, `get_task_detail`
- `take_task_in_progress`, `submit_task_report`, `update_task_report`
- `count_overdue_tasks`
- `can_assign_task` (helper-ish but takes `p_caller_id`; migrate it too)

**Source migrations:**
- `db/migrations/20260426_27_tasks_schema.sql` (if RPCs colocated)
- `db/migrations/20260426_29_rpc_can_assign_task.sql`
- `db/migrations/20260426_30_rpc_tasks_read.sql`
- `db/migrations/20260426_33_rpc_update_task_clear_deadline.sql`

### Task 8.1: Bucket migration

**Files:** Create `db/migrations/20260428_41_rpc_tasks_crud_auth.sql`.

- [ ] Same flow.

### Task 8.2: Sweep callsites

Find via `grep -rln 'create_task\|update_task\|cancel_task\|delete_task\|list_tasks\|get_task_detail\|take_task_in_progress\|submit_task_report\|update_task_report\|count_overdue_tasks' src/`.

Note: `src/components/dashboard/cards/OverdueAllCard.jsx:20` calls `count_overdue_tasks` with `p_caller_id: user?.id ?? null` — the `null` was used for "admin scope". After migration: drop the parameter. The RPC body now uses `has_permission(v_caller_id, 'view_all_overdue')` to decide scope; if the user lacks that permission, it returns only their own count.

(Update the source RPC accordingly in Task 8.1; it's a behaviour-preserving rewrite, not just signature change.)

- [ ] Apply §B.2 + §B.3, run tests.

### Task 8.3: Security + commit + PR

- [ ] Same flow.

---

## Stage 9 — Bucket: teams CRUD

**RPCs:**
- `create_team`, `update_team`, `archive_team`, `restore_team`
- `list_teams`, `get_team_detail`, `list_team_activity`
- `add_team_member`, `remove_team_member`, `move_team_member`
- `assign_team_clients`, `unassign_team_client`, `move_team_client`
- `list_active_teams_for_assignment`, `list_assignable_users`

**Source migrations:**
- `db/migrations/20260425_19_teams_schema.sql`
- `db/migrations/20260425_20_rpc_teams_crud.sql`
- `db/migrations/20260425_21_rpc_teams_members.sql`
- `db/migrations/20260425_22_rpc_teams_clients.sql`

### Task 9.1: Bucket migration

**Files:** Create `db/migrations/20260428_42_rpc_teams_crud_auth.sql`.

### Task 9.2: Sweep callsites

`grep -rln 'create_team\|update_team\|archive_team\|restore_team\|list_teams\|get_team_detail\|list_team_activity\|add_team_member\|remove_team_member\|move_team_member\|assign_team_clients\|unassign_team_client\|move_team_client\|list_active_teams_for_assignment\|list_assignable_users' src/`.

Likely: `src/teams/**`, `src/hooks/useTeam*.js`, `src/hooks/useTeamMembershipsMap.js`.

### Task 9.3: Security + commit + PR

---

## Stage 10 — Bucket: staff

**RPCs:**
- `create_staff`, `update_staff_profile`, `change_staff_password`, `deactivate_staff`
- `list_staff`, `get_staff_detail`, `get_staff_team_membership`

**Source migrations:**
- `db/migrations/20260425_26_rpc_staff_views.sql`
- `db/migrations/20260423_08_rpc_auth_login_update.sql` (if it defines update_staff_profile / change_staff_password)

### Task 10.1: Bucket migration

**Files:** `db/migrations/20260428_43_rpc_staff_auth.sql`.

> `change_staff_password` is special: it currently re-uses `pgcrypto.crypt()` to set `dashboard_users.password_hash`. After Stage 14's `auth_login` drop, `password_hash` is unused; this RPC must instead call into Supabase Auth admin API to set the password — but Edge Functions / SQL can't reach `auth.admin` directly. **Resolution:** convert this RPC into a thin frontend flow: an admin who wants to reset a user's password redirects the user via "send recovery email" UI button → calls `supabase.auth.resetPasswordForEmail` (or service-role `generateLink` from an Edge Function). Drop the SQL RPC entirely.
>
> The migration in Task 10.1 should `DROP FUNCTION change_staff_password(integer, integer, text)` and not recreate it. The frontend's caller (admin "reset password" button) is rewired in Task 10.2 to call the new pathway.

### Task 10.2: Sweep callsites + rewire `change_staff_password` UI

`grep -rln 'change_staff_password\|create_staff\|update_staff_profile\|deactivate_staff\|list_staff\|get_staff_detail\|get_staff_team_membership' src/`.

For `change_staff_password` callsite (likely `src/staff/ChangePasswordModal.jsx` or similar):
- Replace the RPC call with `supabase.auth.resetPasswordForEmail(staffMember.email, { redirectTo: ... })`.
- Update modal copy: "Send password reset link" instead of "Set new password".
- Remove the password-input field from the UI.

### Task 10.3: Security + commit + PR

---

## Stage 11 — Bucket: deletion workflow

**RPCs:**
- `request_deletion`, `approve_deletion`, `reject_deletion`
- `list_deletion_requests`, `count_pending_deletions`
- `apply_user_archived_side_effects` (internal helper — verify it's not called from frontend; if not, leave its signature alone, just revoke anon)

**Source migration:** `db/migrations/20260424_11_rpc_deletion_workflow.sql`

### Task 11.1: Bucket migration

**Files:** `db/migrations/20260428_44_rpc_deletion_auth.sql`.

### Task 11.2: Sweep callsites

`grep -rln 'request_deletion\|approve_deletion\|reject_deletion\|list_deletion_requests\|count_pending_deletions' src/`.

Likely: `src/notifications/*`, `src/clients/RequestDeletionModal.jsx`, related approval modal.

### Task 11.3: Security + commit + PR

---

## Stage 12 — Bucket: dashboard counters / curatorship

**RPCs:**
- `get_operator_curator`, `set_operator_curator`, `bulk_assign_curated_operators`
- `list_curated_operators`, `list_unassigned_operators`

**Source migration:** `db/migrations/20260425_23_rpc_curatorship.sql`

### Task 12.1: Bucket migration

**Files:** `db/migrations/20260428_45_rpc_curatorship_auth.sql`.

### Task 12.2: Sweep callsites

`grep -rln 'get_operator_curator\|set_operator_curator\|bulk_assign_curated_operators\|list_curated_operators\|list_unassigned_operators' src/`.

### Task 12.3: Security + commit + PR

---

## Stage 13 — Edge Functions

PR boundary: own PR.

### Task 13.1: Locate Edge Function source

**Files:**
- Inspect: `supabase/functions/adminApi/index.ts`
- Inspect: `supabase/functions/agencyApi/index.ts`
- Inspect: `supabase/functions/platformApi/index.ts`

If `supabase/functions/` does not exist locally, the Edge Functions live only on the deployed Supabase project. In that case, pull them first:

```bash
npx supabase functions download adminApi --project-ref akpddaqpggktefkdecrl
npx supabase functions download agencyApi --project-ref akpddaqpggktefkdecrl
npx supabase functions download platformApi --project-ref akpddaqpggktefkdecrl
```

### Task 13.2: Create shared `verifyCaller` helper

**Files:**
- Create: `supabase/functions/_shared/auth.ts`

- [ ] **Step 1: Write helper**

```ts
// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export class Unauthorized extends Error {
  status = 401;
}

export async function verifyCaller(req: Request): Promise<{ callerId: number }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Unauthorized('missing Authorization header');

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) throw new Unauthorized('invalid JWT');

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: dbUser, error: dbErr } = await adminClient
    .from('dashboard_users')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (dbErr) throw new Unauthorized('lookup failed');
  if (!dbUser || !dbUser.is_active) throw new Unauthorized('inactive or unlinked');

  return { callerId: dbUser.id };
}
```

### Task 13.3: Migrate each Edge Function

For each of `adminApi`, `agencyApi`, `platformApi`:

**Files:** `supabase/functions/<name>/index.ts`

- [ ] **Step 1: Read current handler**.

- [ ] **Step 2: Replace request-body destructure**:

```diff
+ import { verifyCaller, Unauthorized } from '../_shared/auth.ts';
  ...
  serve(async (req) => {
+   let callerId: number;
+   try {
+     ({ callerId } = await verifyCaller(req));
+   } catch (e) {
+     if (e instanceof Unauthorized) return new Response(e.message, { status: 401 });
+     throw e;
+   }
-   const { caller_id, action, ...rest } = await req.json();
+   const { action, ...rest } = await req.json();
    ...
    // Use `callerId` everywhere `caller_id` was used previously.
```

- [ ] **Step 3: Deploy to dev**

```bash
npx supabase functions deploy adminApi --project-ref akpddaqpggktefkdecrl
# repeat for agencyApi, platformApi
```

### Task 13.4: Sweep frontend callsites

`grep -rln 'caller_id' src/ --include='*.jsx' --include='*.js'`.

Files: `src/AdminPanel.jsx`, `src/sections/AgenciesSection.jsx`, `src/sections/PlatformsSection.jsx` and any others.

- [ ] Drop `caller_id: callerId` from each `*Api(action, { ... })` call.
- [ ] Where the component received `currentUser` solely for `currentUser.id`, remove the prop and read `useAuth()` directly if `user.permissions` is needed for UI gating.

### Task 13.5: Tests + commit + PR

- [ ] **Step 1: `npm test`** → 237/237.
- [ ] **Step 2: Manual smoke** — log in as admin on dev, visit `/admin/agencies`, verify list loads (proves Edge Function auth works).
- [ ] **Step 3: Commit + PR** with title `feat(auth): bucket — Edge Functions verifyCaller`.

---

## Stage 14 — Cleanup

PR boundary: own PR.

### Task 14.1: Anon-grant audit migration

**Files:**
- Create: `db/migrations/20260428_46_anon_grant_audit.sql`

- [ ] **Step 1: Discover any remaining anon grants**

```bash
psql "$DEV_DB_URL" -c "SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid LEFT JOIN pg_proc_acl(p.oid) acl ON true WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');"
```

> If `pg_proc_acl` isn't available on this PostgreSQL version, use:
> `SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');`

Expected before audit: 0 or a small list of stragglers.

- [ ] **Step 2: Write migration that REVOKEs each remaining anon grant**

```sql
-- 46: Anon-grant audit. Defence-in-depth: revoke EXECUTE from anon on every
-- public function. After this point, only authenticated callers can
-- invoke any RPC. Edge Functions remain exempt (they use service-role).

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
                   rec.nspname, rec.proname, rec.args);
    RAISE NOTICE 'Revoked anon EXECUTE on %.%(%)', rec.nspname, rec.proname, rec.args;
  END LOOP;
END;
$$;
```

- [ ] **Step 3: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_46_anon_grant_audit.sql
```

Expected: zero or a few NOTICE lines listing what was revoked.

- [ ] **Step 4: Re-run discovery query**

Expected: empty result — no anon grants remain.

### Task 14.2: Drop `auth_login`

**Files:**
- Create: `db/migrations/20260428_47_drop_auth_login.sql`

- [ ] **Step 1: Write migration**

```sql
-- 47: Drop legacy auth_login RPC. Replaced by supabase.auth.signInWithPassword.
-- dashboard_users.password_hash retained for 30 days as rollback safety;
-- a separate follow-up migration drops the column.

DROP FUNCTION IF EXISTS public.auth_login(text, text);

COMMENT ON COLUMN public.dashboard_users.password_hash IS
  'DEPRECATED 2026-04-28. Retained as rollback safety until ~2026-05-28. Drop scheduled in follow-up migration.';
```

- [ ] **Step 2: Apply to dev**

```bash
psql "$DEV_DB_URL" -f db/migrations/20260428_47_drop_auth_login.sql
```

### Task 14.3: Final invariant checks

- [ ] **Step 1: No `p_caller_id` in any migration's CREATE FUNCTION**

```bash
grep -rEn "p_caller_id" db/migrations/ | grep -v "^db/migrations/20260[0-9]*_[0-9]*_rpc_.*\.sql:.*-- "
```

Expected: empty (excluding old migrations that defined the legacy signatures).

> Note: old migration files still contain `p_caller_id` in their bodies because they ran against the live DB at the time. Don't edit historical migrations — DB state is authoritative. The check above is satisfied because the live DB no longer has any function with that param.

Better check (against live DB):

```bash
psql "$DEV_DB_URL" -c "SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE pg_get_function_arguments(oid) LIKE '%p_caller_id%';"
```

Expected: empty.

- [ ] **Step 2: No `caller_id` / `p_caller_id` in src**

```bash
grep -rEn '\bcaller_id\b|p_caller_id' src/ --include='*.js' --include='*.jsx'
```

Expected: empty (or only inside `// removed` comments — clean those up).

- [ ] **Step 3: No `auth_login` calls**

```bash
grep -rn 'auth_login' src/
```

Expected: empty.

- [ ] **Step 4: Full security suite green**

```bash
npm run test:security
```

Expected: every assertion green.

- [ ] **Step 5: Full unit suite green**

```bash
npm test
```

Expected: 237/237 (or whatever the new baseline is — was 235 + 2 SetPasswordPage).

### Task 14.4: Commit + PR

- [ ] **Step 1: Commit**

```bash
git add db/migrations/20260428_46_anon_grant_audit.sql db/migrations/20260428_47_drop_auth_login.sql
git commit -m "feat(auth): cleanup — anon-grant audit + drop auth_login

Final SQL migration of the auth security migration. Defence-in-depth
revoke of EXECUTE from anon on every public function; legacy auth_login
RPC removed. password_hash column retained 30 days for rollback.

All security regression tests green; impersonation gap closed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Push + open final PR**

```bash
git push
gh pr create --title "feat(auth): cleanup — anon revoke + drop auth_login" --body "$(cat <<'EOF'
Closing the auth security migration. After this lands and is verified on
dev, the cutover playbook (Stage 15) drives the production deploy.

## Summary
- Anon-grant audit: revokes EXECUTE from anon on every remaining public function.
- `auth_login` RPC dropped.
- `dashboard_users.password_hash` retained 30 days for rollback (separate follow-up migration drops the column).

## Test plan
- [x] `npm test` 237/237 green.
- [x] `npm run test:security` 100% green — anon cannot reach any privileged RPC; impersonation via `p_caller_id` impossible (signature mismatch); deactivation invalidates session immediately.
- [x] `grep -r p_caller_id src/` empty.
- [x] `grep -r caller_id src/` empty.
- [x] `pg_proc` query confirms zero functions accept `p_caller_id`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Stage 15 — Cutover (manual, prod)

This stage is **operational, not code**. Each step is a human action or script invocation. There are no commits in this stage — only deployment moves.

### Task 15.1: Pre-cutover (T-7d)

- [ ] **Step 1:** Announce in internal Telegram/Slack. Template:

> 🔒 В ночь с пятницы на субботу (DD.MM, 22:00 МСК) выкатываем обновление безопасности CRM. Окно простоя ~30 минут. После деплоя вам придёт письмо с темой «Set your password» — перейдите по ссылке и задайте новый пароль. Без этого войти не получится. Если письма нет утром — напишите @admin.

- [ ] **Step 2:** Confirm prod URL is NOT in `tests/security/setup.ts` allowlist (paranoia check that nobody runs the destructive security suite against prod).

### Task 15.2: Dev rehearsal one more time (T-1d)

- [ ] **Step 1:** Wipe dev's `auth.users` table (admin-only, via Dashboard).
- [ ] **Step 2:** Re-apply all auth migrations against dev from a clean state.
- [ ] **Step 3:** Re-run migration script: `node scripts/migrate-users-to-supabase-auth.mjs`.
- [ ] **Step 4:** Verify: every active dashboard_users row has auth_user_id; every auth.users row has `email_confirmed_at`.
- [ ] **Step 5:** Manual smoke: receive recovery email at a real test address, set password, log in, hit dashboard, exercise one CRUD. Confirm.

### Task 15.3: Production cutover (T+0)

- [ ] **Step 1: Disable Vercel auto-deploy on `main`** (Vercel UI → Project → Git → "Production Branch" toggle off, or pause integrations).

- [ ] **Step 2: Apply all auth migrations to prod**

```bash
psql "$PROD_DB_URL" -f db/migrations/20260428_35_auth_user_id_link.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_36_current_dashboard_user_id.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_37_get_current_user_profile.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_38_rpc_permissions_attributes_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_39_rpc_clients_crud_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_40_rpc_client_media_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_41_rpc_tasks_crud_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_42_rpc_teams_crud_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_43_rpc_staff_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_44_rpc_deletion_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_45_rpc_curatorship_auth.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_46_anon_grant_audit.sql
psql "$PROD_DB_URL" -f db/migrations/20260428_47_drop_auth_login.sql
```

Each must complete without error. If any fail, **STOP** — do not proceed; revert applied migrations from history and abort cutover.

- [ ] **Step 3: Deploy Edge Functions to prod**

```bash
npx supabase functions deploy adminApi --project-ref <prod-ref>
npx supabase functions deploy agencyApi --project-ref <prod-ref>
npx supabase functions deploy platformApi --project-ref <prod-ref>
```

- [ ] **Step 4: Trigger prod frontend deploy** (Vercel UI → Deployments → redeploy from latest `main`).

Wait until the new deployment is live + healthy.

- [ ] **Step 5: Run migration script against prod**

```bash
SUPABASE_URL="$PROD_SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$PROD_SERVICE_ROLE_KEY" \
node scripts/migrate-users-to-supabase-auth.mjs
```

Expected: every active user gets `OK` line + recovery email dispatched.

- [ ] **Step 6: Smoke-test prod under admin account**

In an incognito browser:
1. Receive recovery email at admin address.
2. Click link → land on `/set-password`.
3. Set a strong password → redirected to `/`.
4. Verify dashboard loads, list_clients returns rows, edit one entity, log out.

- [ ] **Step 7: Open support window**

Stay on call (Telegram support thread) for 2 hours after cutover. For each user that reports issues:
- "I didn't get the email" → re-trigger via Supabase Dashboard → Auth → Users → user → "Send password recovery".
- "Link expired" → same.
- "I can't log in after setting password" → check `dashboard_users.is_active`, re-confirm `auth_user_id` is set; if user genuinely orphaned, manually create their `auth.users` row + link via Dashboard.

### Task 15.4: Post-cutover verification (T+24h)

- [ ] **Step 1: All active users logged in at least once** — run query:

```sql
SELECT du.email, au.last_sign_in_at
FROM public.dashboard_users du
JOIN auth.users au ON au.id = du.auth_user_id
WHERE du.is_active AND au.last_sign_in_at IS NULL;
```

Expected: empty after 24h. Stragglers get a personal nudge from admin.

- [ ] **Step 2: No `p_caller_id` errors in logs** — review Supabase logs for any 4xx mentioning function-signature mismatch (would indicate a frontend that didn't pick up the new build).

---

## Stage 16 — +30d follow-up: drop `password_hash`

This stage runs **30 days after Stage 15** lands cleanly in prod, on a fresh branch.

### Task 16.1: Drop migration

**Files:**
- Create: `db/migrations/2026MMDD_NN_drop_password_hash.sql` (date and index filled at execution time)

- [ ] **Step 1: Sanity check — no code reads `password_hash`**

```bash
grep -rn "password_hash" src/ db/migrations/ supabase/ scripts/ 2>/dev/null
```

Expected: only references are in old migration files (creating/altering the column historically) and the comment added in Stage 14.

- [ ] **Step 2: Write migration**

```sql
-- Drop dashboard_users.password_hash after 30-day rollback window expired.

ALTER TABLE public.dashboard_users
  DROP COLUMN IF EXISTS password_hash;
```

- [ ] **Step 3: Apply on dev** → smoke `npm test` + `npm run test:security` → all green.

- [ ] **Step 4: Apply on prod** → verify nothing breaks.

- [ ] **Step 5: Commit + PR**

```bash
git add db/migrations/<file>
git commit -m "chore(auth): drop dashboard_users.password_hash (30-day rollback window expired)

Final cleanup of the auth security migration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
gh pr create ...
```

---

## Self-review checklist

Run after the plan is complete (also run inline at writing time — see notes below).

**Spec coverage:** Every section of [`2026-04-28-auth-security-migration-design.md`](../specs/2026-04-28-auth-security-migration-design.md) maps to a task here:
- §1 decisions → encoded in task choices (force-reset, big-bang, no 2FA).
- §3 architecture → Stages 1–4 implement the helper, identity flow, and end-state checks.
- §4 DB changes → Stages 1, 5–12, 14.
- §5 RPC pattern → §B template + Stages 5–12.
- §6 Edge Functions → Stage 13.
- §7 Frontend → Stage 2.
- §8 Migration script → Task 3.1.
- §9 Cutover playbook → Stage 15.
- §10 Testing → Stages 4, 5–12 (per bucket), 14.
- §11 Rollback → embedded in Stage 14 (30-day retention) + Stage 16.
- §12 Cadence → captured in stages overview.

**Placeholder scan:** clean. (One earlier "TBD" in Tech Stack about Playwright was removed during self-review — Stage 2 uses vitest + React Testing Library only; no browser automation is introduced by this plan. The spec's §10.3 mention of "Playwright or MSW + jsdom" applies if a separate E2E subplan is added later, not here.)

**Type / name consistency:**
- `current_dashboard_user_id()` used consistently across Tasks 1.2, 1.3, 5.1, §B.1.
- `v_caller_id` (local var name) consistent.
- `auth_user_id` (column name) consistent.
- RPC names match between SQL migrations and frontend grep targets.

**Bucket completeness check:** every RPC from `grep -rh "CREATE OR REPLACE FUNCTION" db/migrations/` either appears in a bucket (Stages 5–12) or is documented as not requiring migration (`_set_updated_at` / `_backfill_ref_code` / `_next_ref_code` / `has_permission`). The `apply_user_archived_side_effects` helper takes `p_caller_id` but is invoked from inside other RPC bodies, not from frontend — covered by Task 11.1's note.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-auth-security-migration.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per stage / per bucket; paired spec+code review per dispatch (the same flow that drove 6B1–6B4 and 6D cleanly). Fast iteration, isolated context per RPC bucket.

2. **Inline Execution** — execute stages in this session using `executing-plans`, with explicit checkpoints between stages.

Given the scope (16 stages, 8 RPC buckets, ~1–2 weeks of work), Subagent-Driven is the right choice.

Which approach?
