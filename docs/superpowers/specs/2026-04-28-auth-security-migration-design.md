# Auth Security Migration · Design Spec

**Status:** Green-lit. Ready for writing-plans.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-28.
**Supersedes:** [`2026-04-27-auth-security-migration-design.md`](2026-04-27-auth-security-migration-design.md) (DRAFT — captured the problem and migration options; this document records the decisions made on top of it).
**Scope:** Authentication architecture rewrite. Independent from the design-system rollout.

---

## 1. Decisions ledger

The DRAFT spec listed five architectural decision points. Resolved 2026-04-28:

| # | Decision | Choice |
|---|---|---|
| 1 | Migration strategy | **A — Full Supabase Auth migration** |
| 2 | Password handling | **A1 — Force-reset all users via email** |
| 3 | Cutover style | **Big-bang** (single deploy window, expected 1–2 h) |
| 4 | 2FA | **Follow-up subplan** (out of scope here) |
| 5 | Production exposure | **Internal-only as-is, no urgency change** |

Why these and not the alternatives — see [DRAFT §3–§4](2026-04-27-auth-security-migration-design.md). The current spec assumes the choices above and does not re-litigate them.

---

## 2. Problem (brief)

Every privileged RPC takes `p_caller_id integer` as a frontend-supplied argument. Combined with the anon API key shipped in the browser bundle and sequential integer user ids, this lets anyone impersonate any user — including superadmin — by calling RPCs from devtools with arbitrary `p_caller_id`. No password required. Full background and concrete impact in [DRAFT §1](2026-04-27-auth-security-migration-design.md).

The fix: identity must come from a server-verified token, not a request argument. Supabase Auth provides this natively — RPCs read `auth.uid()` from the verified JWT instead of trusting the client.

---

## 3. Architecture & end state

### 3.1 Topology change

```
BEFORE
  Browser ─[anon key + p_caller_id=42]─→ RPC ─[has_permission(42, 'x')]─→ DB
                  ↑ client says "I am user 42" — never verified

AFTER
  Browser ─[supabase.auth JWT]─→ RPC ─[auth.uid() → current_dashboard_user_id() → has_permission()]─→ DB
                                       ↑ JWT signed by Supabase, cannot be forged
```

### 3.2 Key components

1. **`auth.users`** (Supabase Auth) becomes the source of truth for identity. Each `dashboard_users` row links to one `auth.users` row via a new `auth_user_id uuid` FK column.
2. **`current_dashboard_user_id()`** — single-source-of-truth helper function that resolves `auth.uid()` → `dashboard_users.id`, filtered by `is_active = true`. Returns NULL → caller is unauthenticated/deactivated.
3. **RPC migration**: every function with `p_caller_id integer` loses that parameter; the body uses `current_dashboard_user_id()` (raised to local var) instead. `auth_login` is dropped entirely; replaced by `supabase.auth.signInWithPassword`.
4. **Frontend**: `useAuth` rewritten on top of `supabase.auth.onAuthStateChange`. All 39 callsite files lose `caller_id` / `p_caller_id` from RPC payloads.
5. **Edge Functions** (`adminApi`, `agencyApi`, `platformApi`) verify the JWT in the `Authorization` header instead of trusting `caller_id` from the body.

### 3.3 End-state checklist

- 0 RPC declarations contain `p_caller_id` (verifiable by `grep -r p_caller_id db/migrations/`).
- 0 frontend files pass `caller_id` / `p_caller_id` to RPC or Edge Functions (verifiable by `grep -r '\bcaller_id\b\|p_caller_id' src/`).
- `auth_login` RPC dropped.
- `GRANT EXECUTE ... TO anon` removed from every RPC. Only `supabase.auth.signInWithPassword` is callable pre-login.
- Every `is_active = true` row in `dashboard_users` has a non-NULL `auth_user_id` linked to a confirmed `auth.users` row.
- 235/235 existing vitest tests remain green; new `tests/security/auth-gate.spec.ts` is green against dev Supabase.

### 3.4 Explicit non-goals (this subplan)

The following are valuable but **not** required to close the impersonation gap. Each becomes its own follow-up subplan once this lands:

- **2FA / TOTP** — Supabase Auth supports it natively; UX needs a dedicated brainstorm (enforce policy per role, recovery codes, "lost device" flow).
- **Replace SECURITY DEFINER RPCs with RLS-only policies** — pure simplification, no security delta.
- **Auth hardening**: rate limiting on login, account lockout, login-attempt audit log, HIBP password checks, minimum password length raise.
- **httpOnly-cookie session storage** (instead of `localStorage`). Mitigates XSS-driven session theft; requires SSR or a dedicated auth-helper integration.
- **Service-role / integration-account flow** — assumed to not exist. If discovered, admin sets the password manually via Supabase Dashboard during cutover.

---

## 4. Database changes

### 4.1 Migration order

| # | File | Purpose |
|---|---|---|
| N+1 | `<date>_auth_user_id_link.sql` | Add `dashboard_users.auth_user_id uuid UNIQUE REFERENCES auth.users(id)` + index. NULL allowed temporarily. |
| N+2 | `<date>_current_dashboard_user_id.sql` | Helper function (see §4.2). |
| N+3 … N+M | `<date>_rpc_<bucket>.sql` (one per bucket) | Migrate RPCs in that bucket — DROP old signatures, CREATE OR REPLACE new ones, regrant. See §5.4 bucket split. |
| N+last | `<date>_drop_auth_login.sql` | `DROP FUNCTION auth_login(text, text)`. **`password_hash` column retained for 30 days** as rollback safety. A separate follow-up migration drops the column. |

### 4.2 Helper function

```sql
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
```

Returns NULL when:
- `auth.uid()` is NULL (anon caller),
- the JWT-identified user has no row in `dashboard_users`,
- the row is `is_active = false`.

Consequence: deactivating a user via `UPDATE dashboard_users SET is_active = false` instantly invalidates all in-flight session calls — they fail with "unauthorized" on the next RPC. No client-side logout needed.

### 4.3 New supporting RPC

`get_current_user_profile()` — read-only, replaces the post-login hydration that `auth_login` previously did:

```sql
CREATE OR REPLACE FUNCTION public.get_current_user_profile()
RETURNS TABLE (
  id integer, email text, first_name text, last_name text, role text,
  is_active boolean, permissions text[], attributes jsonb, ...
) AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  RETURN QUERY SELECT u.id, u.email, ..., array(SELECT perm FROM user_permissions WHERE user_id = u.id), ...
  FROM dashboard_users u WHERE u.id = v_caller_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;
```

Called by `useAuth` after every `onAuthStateChange` to hydrate the user object.

---

## 5. RPC migration pattern

### 5.1 Mechanical transformation

For each RPC with `p_caller_id integer` as the first parameter:

1. Remove `p_caller_id integer` from the signature.
2. At the top of the function body, declare and initialize the caller id from the helper:
   ```sql
   DECLARE v_caller_id integer := current_dashboard_user_id();
   BEGIN
     IF v_caller_id IS NULL THEN
       RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
     END IF;
     -- ...
   ```
3. Replace every `p_caller_id` reference in the body with `v_caller_id`.
4. Add `DROP FUNCTION IF EXISTS <name>(<old signature>);` immediately before `CREATE OR REPLACE` (PostgreSQL identifies functions by signature; signature change requires explicit drop).
5. Replace the GRANT block. Two cases:
   - **Signature changed** (anything that lost `p_caller_id`): the preceding `DROP FUNCTION` already removed all grants. Add only `GRANT EXECUTE ON FUNCTION <new sig> TO authenticated;`.
   - **Signature unchanged** (RPC that already lacked `p_caller_id`, e.g. `get_user_attributes(p_user_id)`): old `GRANT … TO anon` is still live until explicitly revoked. Add **both** `REVOKE EXECUTE ON FUNCTION <sig> FROM anon;` and `GRANT EXECUTE ON FUNCTION <sig> TO authenticated;`.
6. The final cleanup-bucket migration (§5.4) sweeps the schema and revokes any remaining `anon` execute grants caught by audit query, as defence-in-depth.

### 5.2 Before / after example

**Before** (excerpted):
```sql
CREATE OR REPLACE FUNCTION update_staff_profile(
  p_caller_id integer, p_user_id integer, p_first_name text, ...
) RETURNS ... AS $$
BEGIN
  IF NOT has_permission(p_caller_id, 'edit_users') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- body uses p_caller_id for audit columns, ownership checks, ...
END;
$$ SECURITY DEFINER SET search_path = public, extensions LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION update_staff_profile(integer,integer,text,...) TO anon, authenticated;
```

**After**:
```sql
DROP FUNCTION IF EXISTS update_staff_profile(integer, integer, text, ...);

CREATE OR REPLACE FUNCTION update_staff_profile(
  p_user_id integer, p_first_name text, ...
) RETURNS ... AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF NOT has_permission(v_caller_id, 'edit_users') THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;
  -- body uses v_caller_id where p_caller_id was used.
END;
$$ SECURITY DEFINER SET search_path = public, extensions LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION update_staff_profile(integer, text, ...) TO authenticated;
```

### 5.3 Edge cases

- **`count_overdue_tasks(p_caller_id integer)`** — `OverdueAllCard.jsx` currently passes `null` to mean "admin scope across all users". Post-migration: `null` semantics replaced with a permission gate (e.g. `has_permission(v_caller_id, 'view_all_overdue')`); the parameter goes away. The exact pattern is decided per-RPC during plan stage.
- **`auth_login(text, text)`** — dropped entirely. No deprecation wrapper.
- **`has_permission(p_user_id, perm)`** — internal helper, called from inside other RPC bodies with `v_caller_id`. Signature stays as-is. Not granted to anon; not granted to authenticated either (only callable from SECURITY DEFINER bodies).

### 5.4 Bucket split (preliminary)

Final split is locked in during writing-plans. Rough buckets, ordered for incremental rollout:

| Bucket | RPC count | Source migration files |
|---|---:|---|
| auth foundation (helper + drop login + `get_current_user_profile`) | 3 | new |
| permissions / attributes | ~5 | `rpc_attributes`, `user_permissions` |
| clients CRUD | ~6 | `rpc_client_crud` |
| client media | ~5 | `rpc_client_media` |
| tasks CRUD | ~10 | `rpc_tasks_*`, `can_assign_task` |
| teams CRUD | ~10 | `rpc_teams_*` |
| staff | ~5 | `rpc_staff_views` |
| deletion workflow | ~4 | `rpc_deletion_workflow` |
| dashboard counters | ~3 | `rpc_curatorship`, counters |
| cleanup — anon-grant audit + drop `auth_login` | 1 | new |
| **+30d follow-up** (separate PR) — `DROP COLUMN dashboard_users.password_hash` | 0 | new |

Each bucket is a single PR following the subagent-driven flow used in 6B-series and 6D: spec → migration draft → paired spec+code review per dispatch.

---

## 6. Edge Functions

`supabase/functions/` hosts three: `adminApi`, `agencyApi`, `platformApi`. Each currently accepts `caller_id` in the request body — same gap as RPCs.

### 6.1 Verification helper

Extract to `supabase/functions/_shared/auth.ts`:

```ts
export async function verifyCaller(req: Request): Promise<{ callerId: number }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Response('unauthorized', { status: 401 });

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await authClient.auth.getUser();
  if (authErr || !user) throw new Response('unauthorized', { status: 401 });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: dbUser } = await adminClient
    .from('dashboard_users')
    .select('id, is_active')
    .eq('auth_user_id', user.id)
    .single();
  if (!dbUser || !dbUser.is_active) throw new Response('unauthorized', { status: 401 });

  return { callerId: dbUser.id };
}
```

Each handler starts with `const { callerId } = await verifyCaller(req);` and never reads `caller_id` from the body again.

### 6.2 Frontend invocation

`supabase.functions.invoke` automatically forwards the session JWT in `Authorization: Bearer …` when a session is active — no client config needed. Callsites simply drop `caller_id` from the payload:

```diff
- agencyApi('list', { caller_id: callerId })
+ agencyApi('list', {})
```

---

## 7. Frontend changes

### 7.1 `useAuth.jsx` rewrite

- State: `session: Supabase.Session | null` and `user: DashboardUser | null` (where `DashboardUser` includes permissions and attributes).
- `useEffect` on mount: `supabase.auth.getSession()` → seed `session`; subscribe to `supabase.auth.onAuthStateChange` for ongoing updates.
- `useEffect` on `session` change: if non-null, call `supabase.rpc('get_current_user_profile')` and store the result in `user`. If null, clear `user`.
- `signIn(email, password)` → `supabase.auth.signInWithPassword`.
- `signOut()` → `supabase.auth.signOut`.
- The manual `localStorage` cache is removed; Supabase Auth manages session persistence under its own key.

### 7.2 Callsite sweep (39 files)

Mechanical transformation, applied per bucket via subagent dispatch:

```diff
- supabase.rpc('list_clients', { p_caller_id: user.id, p_status: 'active' })
+ supabase.rpc('list_clients', { p_status: 'active' })
```

Prop-drilled `currentUser` in `AdminLayout` → `AdminPanel` / `AgenciesSection` / `PlatformsSection` is simplified: components read `useAuth()` directly where they need `user.permissions` for UI gating, and the prop disappears.

### 7.3 New pages

- **`/set-password`** — Recovery-link landing. Reads the recovery token from the URL hash (Supabase Auth handles validation), shows a form, calls `supabase.auth.updateUser({ password })`, redirects to `/`.
- **`/login`** — Reworked on top of `signInWithPassword`. Russian error mapping. New "забыли пароль?" link → `supabase.auth.resetPasswordForEmail` (free with Supabase Auth).

---

## 8. Migration script (data plane)

`scripts/migrate-users-to-supabase-auth.mjs` — one-shot Node script using the service-role key. Idempotent; safe to re-run.

```js
const { data: users } = await admin.from('dashboard_users')
  .select('id, email, is_active').eq('is_active', true);

for (const u of users) {
  // 1. Create or fetch auth.users row, no password set
  let authUserId = await findExistingAuthUserId(admin, u.email);
  if (!authUserId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
    });
    if (error) { log(`SKIP ${u.email}: ${error.message}`); continue; }
    authUserId = data.user.id;
  }

  // 2. Link
  await admin.from('dashboard_users')
    .update({ auth_user_id: authUserId }).eq('id', u.id);

  // 3. Send "set password" email (recovery link)
  await admin.auth.admin.generateLink({ type: 'recovery', email: u.email });
  log(`OK ${u.email} → ${authUserId}`);
}
```

- Inactive users: skipped. Reactivation later is admin-driven via Supabase Dashboard.
- Failures: logged and skipped, never abort the loop. A failed row keeps `auth_user_id` NULL — re-running the script picks it up.

---

## 9. Cutover playbook

Times below are placeholders — pick a real low-traffic window before the deploy.

| Step | When | Action |
|---|---|---|
| -7d | Week before | Announce window in internal Telegram/Slack: "deploying security update; afterwards check email and set a new password". |
| -1d | Day before | Run **full rehearsal** on dev DB: apply all migrations, run script, run security tests, smoke-test login + one CRUD path. |
| -1h | Hour before | Disable auto-deploy on `main`; switch to manual. |
| **T+0** | Window start | Apply DB migrations (helper + bucket migrations + cleanup *without* `DROP COLUMN password_hash`). |
| T+5 | | Deploy frontend (Vercel preview → production). |
| T+10 | | Run migration script → `auth.users` rows created, recovery emails dispatched. |
| T+15 | | Smoke test as admin: receive email → set-password page → login → dashboard loads → `list_clients` returns. |
| T+30 | | Open a support channel for the night. Anyone stuck (no email received, link expired) — admin sets password manually via Supabase Dashboard. |
| +30d | A month later | Follow-up migration: `ALTER TABLE dashboard_users DROP COLUMN password_hash`. |

---

## 10. Testing strategy

### 10.1 Existing suite (235/235 baseline)

Unit tests mock `supabase`. They keep working: only mock-input shapes change (one fewer parameter). Each bucket's PR includes the matching mock updates; if vitest goes red, the bucket does not merge.

### 10.2 New security regression suite

`tests/security/auth-gate.spec.ts` — **integration**, not mocks. Run against dev Supabase under a separate command (`npm run test:security`) so it does not slow down the local `npm test` loop or block on a network-bound DB. Required cases:

- Anon client cannot call any privileged RPC (gets a forbidden / unauthorized error, not a "function not found" error).
- A logged-in user cannot impersonate another by passing `p_caller_id` — the RPC's new signature has no such parameter, so PostgREST returns a function-signature mismatch.
- Deactivating a user mid-session causes their next RPC call to fail with `28000`.
- Tabular check across every RPC name in `db/migrations/`: anon role gets a 401/403, never `PGRST202` ("function not found").

Seed data: `scripts/seed-test-users.mjs` creates `userA, userB, userC` with known passwords; spec idempotent so it can re-run.

### 10.3 E2E smoke

`tests/e2e/auth-flow.spec.ts` (Playwright or MSW + jsdom — to be picked at plan stage):
1. `/login` → enter credentials → land on `/`.
2. Without a session, `/clients` redirects to `/login`.
3. After `signOut`, `/clients` redirects to `/login`.
4. Reset-password flow: `/login` → "forgot password" → email → recovery link → `/set-password` → new password → login.

### 10.4 Migration script verification (dev rehearsal)

Before any production deploy, on dev DB:
1. Wipe `auth.users` on dev.
2. Run the migration script.
3. Assert `SELECT count(*) FROM dashboard_users WHERE is_active AND auth_user_id IS NULL = 0`.
4. Assert every new `auth.users` row has `email_confirmed_at IS NOT NULL`.
5. Re-run the script — must not fail and must not create duplicates.

### 10.5 Pre-merge gates (per bucket)

- 235/235 vitest green.
- Security tests green against dev Supabase (full suite, not just the bucket).
- Project-wide grep `\bp_caller_id\b` in migrations under that bucket = 0.
- Project-wide grep `\bcaller_id\b\|p_caller_id` in `src/` for callsites that bucket touches = 0.

---

## 11. Rollback plan

| Phase | If we abort here | What to do |
|---|---|---|
| Before T+10 (migrations applied, script not run) | Anything goes wrong with migrations or first smoke test. | `git revert` migration commits + redeploy old migrations from history. `password_hash` is still authoritative; users keep logging in via the old `auth_login`. |
| Between T+10 and T+30 | Mass user breakage right after script runs. | Vercel one-click rollback to previous frontend; restore `auth_login` + old RPC signatures from `main`. Users log in via `password_hash` again. Orphan `auth.users` rows are cleaned up later by a separate script. |
| Up to +30d | Subtle issues surface in the first month. | Same as above — `password_hash` retained for exactly this window. |
| After +30d (`DROP COLUMN password_hash`) | Point of no return. | No automated rollback; would require re-creating passwords from scratch via admin reset. |

---

## 12. Implementation cadence

This subplan is the largest in the project to date — ~60 RPC migrations, 39 callsite files, 3 Edge Functions, a data-plane script, and a new login/set-password flow. The implementation plan will:

- Stage the work along the bucket boundaries in §5.4.
- Drive each bucket via subagent-driven development with paired spec+code review (the proven pattern from 6B1–6B4 and 6D).
- Treat the dev rehearsal of the migration script as an explicit stage before any production cutover step.

Estimated wall time: 1–2 weeks of focused work, depending on review cycles.

---

## 13. References

- DRAFT predecessor: [`2026-04-27-auth-security-migration-design.md`](2026-04-27-auth-security-migration-design.md).
- System design context: [`docs/superpowers/specs/2026-04-23-crm-system-design.md`](2026-04-23-crm-system-design.md).
- Supabase Auth docs: <https://supabase.com/docs/guides/auth>.
- Supabase Auth admin API (used by migration script): <https://supabase.com/docs/reference/javascript/auth-admin-createuser>.
