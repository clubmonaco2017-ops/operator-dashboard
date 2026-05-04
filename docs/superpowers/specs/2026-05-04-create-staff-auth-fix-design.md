# Create-Staff Auth Fix — Design Spec

**Date:** 2026-05-04
**Status:** Approved (brainstorm complete, plan next)
**Trigger:** Staff created via the `/staff` UI cannot log in because `create_staff` only inserts into `public.dashboard_users` and never creates a corresponding `auth.users` row. Login goes through `supabase.auth.signInWithPassword` against `auth.users`, so newly-created staff are stranded until an admin manually creates the auth row in the Supabase Dashboard and patches `dashboard_users.auth_user_id`.

## Goal

Make staff creation through the UI produce a working, loggable user in a single flow:

1. `auth.users` row is created with email + password (auto-confirmed).
2. `public.dashboard_users` row is inserted with `auth_user_id` linked to the new `auth.users.id`.
3. `dashboard_users.password_hash` is still mirrored (legacy mirror for Stage 16 — drop later).
4. Same flow for every role created through the `/staff` UI: `admin`, `moderator`, `teamlead`, `operator`.
5. Best-effort rollback: if the `create_staff` RPC fails after `auth.users` creation, the auth user is deleted; the orphan is logged if delete also fails.

## Non-goals

- Invite-link / "set your own password" UX (deferred — current admin-sets-password flow stays).
- `update_staff_profile` email synchronization with `auth.users.email` (separate subplan if needed).
- `change_password` flow (already runs through `supabase.auth.resetPasswordForEmail` — untouched).
- Stage 16 drop of `dashboard_users.password_hash` (deferred to ~2026-05-29 per the auth-migration roadmap).
- `create_staff` 9-arg overload removal — the new signature is a 10-arg replacement; the 9-arg overload is dropped in the same migration to keep the function set unambiguous.

## Architecture

```
CreateStaffSlideOut.jsx
  └─ adminFetch('/api/admin/create-staff', POST, { ...rpcArgs })
        └─ verifyCaller(req)               (api/admin/_auth.js — existing)
        └─ supabase.auth.admin.createUser({ email, password, email_confirm: true })
        └─ supabase.rpc('create_staff', { ..., p_auth_user_id: authUser.id })
              ├─ success → respond 200 { id }
              └─ failure → supabase.auth.admin.deleteUser(authUser.id) (best-effort)
                          → respond 500 { error: 'rpc failed: <msg>' }
                          → if delete also fails: console.error orphan, still respond 500
```

The frontend's direct `supabase.rpc('create_staff', ...)` call is replaced with `adminFetch`. The RPC permission check (`has_permission(caller_id, 'create_users')`) stays as the authoritative authorization gate — the endpoint relays the RPC's `42501` exception as 403.

## Database migration (115)

New file: `db/migrations/20260504_115_create_staff_auth_user_id.sql`.

- Drop the existing 9-arg overload `public.create_staff(text,text,text,text,text,text,text[],uuid,uuid[])`.
- Create a 10-arg replacement that adds `p_auth_user_id uuid DEFAULT NULL` as the last parameter.
- The body is identical to migration 106's body **plus** the `auth_user_id` column in the `dashboard_users` INSERT.
- When `p_auth_user_id` is `NULL`, `auth_user_id` is inserted as `NULL` — preserves backwards compatibility for the legacy script `scripts/migrate-users-to-supabase-auth.mjs`, which inserts dashboard rows separately (not through this RPC) but should not break if invoked.
- `password_hash` is still written via `crypt(p_password, gen_salt('bf'))` (legacy mirror until Stage 16).

```sql
DROP FUNCTION IF EXISTS public.create_staff(text,text,text,text,text,text,text[],uuid,uuid[]);

CREATE OR REPLACE FUNCTION public.create_staff(
  p_email             text,
  p_password          text,
  p_role              text,
  p_first_name        text,
  p_last_name         text,
  p_alias             text,
  p_permissions       text[],
  p_agency_id         uuid      DEFAULT NULL,
  p_admin_agency_ids  uuid[]    DEFAULT ARRAY[]::uuid[],
  p_auth_user_id      uuid      DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
-- body: identical to migration 106 +
--   `auth_user_id` column added to the dashboard_users INSERT
--   value: p_auth_user_id
$$;
```

Rollback: re-apply migration 106 to restore the 9-arg overload.

## Endpoint contract — `api/admin/create-staff.js`

| Field   | Value |
|---------|-------|
| Method  | `POST` |
| Auth    | `Authorization: Bearer <jwt>` (required) |
| Runtime | `nodejs` (default; no edge config needed) |
| Body    | `{ email, password, role, first_name, last_name, alias, permissions, agency_id?, admin_agency_ids? }` |

Response codes:

| Status | When | Body |
|---|---|---|
| 200 | success | `{ id: <integer dashboard_users.id> }` |
| 400 | malformed body / missing required fields | `{ error: '<reason>' }` |
| 401 | missing/invalid JWT, unlinked dashboard user, inactive caller | `{ error: '<reason>' }` (existing `_auth.js` errors) |
| 403 | RPC raised `42501` (no `create_users` permission) | `{ error: 'forbidden: insufficient permission' }` |
| 409 | `auth.admin.createUser` returned email-exists | `{ error: 'email already exists' }` |
| 422 | RPC raised validation error (`23502`/`23514`/invalid role) | `{ error: '<rpc message>' }` |
| 500 | RPC failure after auth.users created | `{ error: 'rpc failed: <msg>' }` (auth.users best-effort deleted) |
| 500 | auth.admin.createUser failed for non-collision reason | `{ error: 'auth-create failed: <msg>' }` |

Error mapping: the endpoint inspects `error.code` from the RPC (`42501`, `23502`, `23514`) and maps to 403/422 respectively. Anything else from the RPC falls through to 500. The `auth.admin.createUser` error is checked for collision text — Supabase returns 422 with `code: 'email_exists'` (or matching message) — and mapped to 409.

Authorization: `verifyCaller` resolves the caller; the endpoint does **not** enforce a role allowlist. The RPC's permission check is the source of truth, matching the answer to Q2 (option A — permission-driven, no hardcoded role list at the endpoint layer).

## Frontend wiring — `CreateStaffSlideOut.jsx`

Replace:

```js
const { data: newId, error: rpcError } = await supabase.rpc('create_staff', rpcArgs)
```

with:

```js
const res = await adminFetch('/api/admin/create-staff', { method: 'POST', body: rpcArgs })
const newId = res.id
```

Form-level error mapping:

| Endpoint status | UI message |
|---|---|
| 409 | "Этот email уже используется" |
| 403 | "Нет прав на создание пользователей" |
| 422 | RPC's message verbatim (already user-facing in Russian where present) |
| other | "Не удалось создать сотрудника. Попробуйте ещё раз." |

The form payload shape (`rpcArgs`) is unchanged — same field names — so the body is forwarded as-is.

## Pre-deploy data cleanup

Three stranded test rows exist in production (created via `/staff` between cutover and now, all without `auth_user_id`):

| id | email | role |
|----|-------|------|
| 18 | modertest@gmail.com | moderator |
| 19 | tlider@gmail.com | teamlead |
| 20 | oper1@gmail.om (typo) | operator |

These are throwaway test accounts (Q4 = A). Run before deploy in Studio:

```sql
DELETE FROM dashboard_users WHERE id IN (18, 19, 20);
```

Cascade: `user_permissions` rows are removed by `ON DELETE CASCADE` on the FK; `agency_id` is just a column on the deleted row. After deploy, these three users are recreated through the `/staff` UI to verify the new flow.

## Testing

**Unit — `api/admin/create-staff.test.js` (new):**

Mocks `supabase.auth.admin.createUser`, `supabase.auth.admin.deleteUser`, and `supabase.rpc`. Cases:

1. Success — auth + RPC both resolve → 200 `{ id }`.
2. Auth-create fails with email-exists → 409, RPC not called, deleteUser not called.
3. Auth-create fails generic → 500, RPC not called, deleteUser not called.
4. RPC fails with 42501 → 403, deleteUser called once with `authUser.id`.
5. RPC fails with 23502 (missing agency_id) → 422, deleteUser called once.
6. RPC fails with generic error → 500, deleteUser called once.
7. RPC fails AND deleteUser also fails → 500, console.error logged with orphan id.
8. Missing Authorization header → 401, no auth/RPC calls.
9. JWT invalid → 401 (verifyCaller path).

Pattern follows `api/push/_verify.test.js`. Test runner: existing Vitest harness in the repo.

**Manual smoke (post-deploy):**

1. Login as superadmin.
2. Create staff with role `operator`, agency assigned, password `Test123!`.
3. Logout, login as the new operator → expect dashboard loads (no "invalid JWT").
4. Trigger error path: try to create staff with the same email → expect "Этот email уже используется".

## Stages (high-level — full plan to follow)

1. Migration 115 — 10-arg `create_staff` with `p_auth_user_id`.
2. Endpoint `api/admin/create-staff.js` + Vitest unit tests.
3. Frontend `CreateStaffSlideOut.jsx` switched to `adminFetch`.
4. Pre-deploy cleanup `DELETE FROM dashboard_users WHERE id IN (18,19,20)` in Studio.
5. Deploy production via `vercel --prod`.
6. Manual smoke — create + login + email collision.
7. Commit, PR, merge.

## Decisions log

- **Q1 — Email confirmation:** Auto-confirm with admin-supplied password (option A). Minimum UX churn; admin already enters the password in the existing form. Invite-link is backlog.
- **Q2 — Authorization:** Permission-driven via RPC's `has_permission('create_users')` check (option A). No hardcoded role list at the endpoint layer; the endpoint relays the RPC's 42501 as 403.
- **Q3 — Rollback:** Best-effort `auth.admin.deleteUser` in catch + `console.error` on cleanup failure (option A). No retry queue, no orphan-tracking table.
- **Q4 — Legacy backfill:** Delete the 3 stranded test rows (option A) and recreate them through the new flow as part of post-deploy smoke.

## Open follow-ups

- Stage 16 — drop `dashboard_users.password_hash` (~2026-05-29).
- Audit `update_staff_profile` for email sync with `auth.users.email` if email changes are observed in production.
- Periodic check: `SELECT count(*) FROM dashboard_users WHERE auth_user_id IS NULL AND is_active = true` — should stay at 0 after this fix lands.
