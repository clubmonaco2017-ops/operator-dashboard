# Create-Staff Auth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make staff creation through the `/staff` UI produce a fully loggable user by inserting both an `auth.users` row and a linked `dashboard_users` row in a single flow, with best-effort rollback on failure.

**Architecture:** Frontend posts to a new `/api/admin/create-staff` endpoint which (a) verifies the caller via Bearer JWT, (b) creates an `auth.users` row via `supabase.auth.admin.createUser`, (c) calls a new 10-arg `create_staff` RPC that accepts `p_auth_user_id`, and (d) deletes the auth row best-effort if the RPC fails. The RPC's existing `has_permission('create_users')` check stays as the authorization gate.

**Tech Stack:** Node.js (Vercel Functions, default `nodejs` runtime), Supabase (Postgres + Auth Admin API via `@supabase/supabase-js`), Vitest, React 19 (Vite), pgcrypto for legacy `password_hash` mirror.

**Spec:** `docs/superpowers/specs/2026-05-04-create-staff-auth-fix-design.md`

---

## File Structure

**New files:**
- `db/migrations/20260504_115_create_staff_auth_user_id.sql` — replaces 9-arg `create_staff` with 10-arg version that accepts `p_auth_user_id` and writes `auth_user_id` to `dashboard_users`.
- `api/admin/create-staff.js` — Vercel function handler (default export). Verifies caller, creates `auth.users`, calls RPC, rolls back on failure.
- `api/admin/create-staff.test.js` — Vitest unit tests for the handler with mocked `verifyCaller` + Supabase admin client.

**Modified files:**
- `src/components/staff/CreateStaffSlideOut.jsx` — replace `supabase.rpc('create_staff', rpcArgs)` with `adminFetch('/api/admin/create-staff', rpcArgs)`. Add error mapping by HTTP status.

**Manual operations (Studio + production):**
- Pre-deploy: `DELETE FROM dashboard_users WHERE id IN (18, 19, 20)` in Supabase Studio.
- Apply migration 115 in Supabase Studio SQL editor.
- Deploy via `vercel --prod` from main after merge.

---

## Task 1: Database migration 115

**Files:**
- Create: `db/migrations/20260504_115_create_staff_auth_user_id.sql`

This task adds `p_auth_user_id uuid DEFAULT NULL` to `create_staff` and inserts it into `dashboard_users.auth_user_id`. The 9-arg overload from migration 106 is dropped first to keep the function set unambiguous (Postgres allows multiple overloads but the 9-arg one would be unreachable from the new endpoint and confusing for future readers).

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/20260504_115_create_staff_auth_user_id.sql
--
-- Migration 115: extend create_staff to accept and persist auth_user_id.
--
-- Background: migration 106 introduced a 9-arg create_staff that writes
-- only to dashboard_users (with a bcrypt password_hash). After the
-- 2026-04-29 auth migration cutover, login goes through Supabase Auth's
-- auth.users table — so users created by 106's RPC cannot log in.
--
-- This migration drops the 9-arg overload and replaces it with a 10-arg
-- version that accepts p_auth_user_id (the linked auth.users.id created
-- server-side via supabase.auth.admin.createUser). The new column is
-- written to dashboard_users.auth_user_id; everything else (including
-- the password_hash legacy mirror) is unchanged.
--
-- Default p_auth_user_id = NULL preserves backwards-compat for any
-- non-UI caller that may still invoke the RPC directly (e.g. dev seed
-- scripts), although the production UI path always passes a real UUID.

BEGIN;

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
DECLARE
  v_caller_id   integer := current_dashboard_user_id();
  v_new_id      integer;
  v_ref_code    text;
  v_perm        text;
  v_admin_agid  uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  IF NOT has_permission(v_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', v_caller_id USING errcode = '42501';
  END IF;

  IF p_role NOT IN ('admin','moderator','teamlead','operator') THEN
    RAISE EXCEPTION 'Invalid role for create_staff: %', p_role;
  END IF;

  IF p_role IN ('moderator','teamlead','operator') THEN
    IF p_agency_id IS NULL THEN
      RAISE EXCEPTION 'agency_id is required for role %', p_role USING errcode = '23502';
    END IF;
    PERFORM assert_agency_access(v_caller_id, p_agency_id);
  ELSIF p_role = 'admin' THEN
    IF p_agency_id IS NOT NULL THEN
      RAISE EXCEPTION 'agency_id must be NULL for admin role; use p_admin_agency_ids'
        USING errcode = '23514';
    END IF;
    IF p_admin_agency_ids IS NOT NULL AND array_length(p_admin_agency_ids, 1) > 0 THEN
      FOREACH v_admin_agid IN ARRAY p_admin_agency_ids LOOP
        PERFORM assert_agency_access(v_caller_id, v_admin_agid);
      END LOOP;
    END IF;
  END IF;

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions, agency_id, auth_user_id
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    v_caller_id,
    '{}'::jsonb,
    p_agency_id,
    p_auth_user_id
  )
  RETURNING id INTO v_new_id;

  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, v_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  IF p_role = 'admin'
     AND p_admin_agency_ids IS NOT NULL
     AND array_length(p_admin_agency_ids, 1) > 0 THEN
    INSERT INTO admin_agencies (user_id, agency_id, granted_by, granted_at)
    SELECT v_new_id, agid, v_caller_id, now()
      FROM unnest(p_admin_agency_ids) AS agid
    ON CONFLICT (user_id, agency_id) DO NOTHING;
  END IF;

  INSERT INTO staff_activity (actor_id, target_user_id, action, payload)
  VALUES (
    v_caller_id,
    v_new_id,
    'user_created',
    jsonb_build_object(
      'role',  p_role,
      'email', p_email
    )
  );

  RETURN v_new_id;
END $$;

COMMIT;

-- VERIFY:
--   SELECT pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'create_staff' AND pronamespace = 'public'::regnamespace;
--   -- Expected: one row with 10 args ending in `p_auth_user_id uuid`.
--
-- ROLLBACK:
--   Re-run migration 20260503_106_create_staff_9arg_writes_activity.sql
--   to restore the 9-arg overload.
```

> **Note for the implementing agent:** before writing, run
> `cat db/migrations/20260503_106_create_staff_9arg_writes_activity.sql`
> and confirm the body above matches sections present there (especially the
> `admin_agencies` insert and the `staff_activity` insert). Migration 106 in
> the repo is the source of truth for everything except the new column +
> parameter — copy any drift from there verbatim. Do not paraphrase.

- [ ] **Step 2: Run the file through `psql --dry-run`-like check using `psql -c '\sf'` substitute**

Skip — Supabase Studio applies the SQL. Local Postgres isn't part of this project's workflow (per `project_db_schema.md` memory).

- [ ] **Step 3: Apply in Supabase Studio**

Open Studio SQL editor, paste the migration file's contents (everything between `BEGIN;` and `COMMIT;` plus the surrounding lines), execute. Expect "Success. No rows returned."

- [ ] **Step 4: Verify the new signature**

In Studio:

```sql
SELECT pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname = 'create_staff' AND pronamespace = 'public'::regnamespace;
```

Expected: one row containing
`p_email text, p_password text, p_role text, p_first_name text, p_last_name text, p_alias text, p_permissions text[], p_agency_id uuid, p_admin_agency_ids uuid[], p_auth_user_id uuid`.

If two rows appear, the 9-arg overload was not dropped — re-run the `DROP FUNCTION` line.

- [ ] **Step 5: Commit the migration file**

```bash
git add db/migrations/20260504_115_create_staff_auth_user_id.sql
git commit -m "feat(staff): create_staff accepts p_auth_user_id (migration 115)"
```

---

## Task 2: Endpoint `api/admin/create-staff.js` (TDD)

**Files:**
- Create: `api/admin/create-staff.js`
- Create: `api/admin/create-staff.test.js`

The handler accepts `POST` only, runs `verifyCaller` for auth, creates an `auth.users` row, calls the RPC, and rolls back the auth row on RPC failure. Tests mock `verifyCaller` and `getSupabaseAdmin` to drive each branch.

The response shape mirrors `api/admin/platforms.js` and what `adminFetch` expects: `{ data: { id } }` on success, `{ error: '<message>' }` on failure (with the appropriate HTTP status). The frontend `adminFetch` helper unwraps `{ data, error }` automatically.

- [ ] **Step 1: Write the failing test scaffold**

Create `api/admin/create-staff.test.js`:

```javascript
// api/admin/create-staff.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks for the two collaborators imported by the handler.
const mockVerifyCaller = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('./_auth.js', () => ({
  verifyCaller: (...args) => mockVerifyCaller(...args),
  Unauthorized: class Unauthorized extends Error {
    constructor(msg) { super(msg); this.status = 401 }
  },
}))

vi.mock('./_supabase.js', () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
    rpc: mockRpc,
  }),
}))

// Import AFTER mocks so the module picks them up.
const { default: handler } = await import('./create-staff.js')

function makeReq({ method = 'POST', body = {}, headers = { authorization: 'Bearer t' } } = {}) {
  return { method, body, headers }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return res
}

const VALID_BODY = {
  p_email: 'new@example.com',
  p_password: 'Test123!',
  p_role: 'operator',
  p_first_name: 'New',
  p_last_name: 'User',
  p_alias: null,
  p_permissions: [],
  p_agency_id: '00000000-0000-0000-0000-000000000001',
  p_admin_agency_ids: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyCaller.mockResolvedValue({ callerId: 1, role: 'admin' })
})

describe('POST /api/admin/create-staff', () => {
  it('creates auth user, calls RPC with p_auth_user_id, returns 200 + { data: { id } }', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-1' } }, error: null })
    mockRpc.mockResolvedValue({ data: 42, error: null })

    const req = makeReq({ body: VALID_BODY })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ data: { id: 42 } })
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'Test123!',
      email_confirm: true,
    })
    expect(mockRpc).toHaveBeenCalledWith('create_staff', {
      ...VALID_BODY,
      p_auth_user_id: 'auth-uuid-1',
    })
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('returns 405 for non-POST', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 401 when verifyCaller throws Unauthorized', async () => {
    const { Unauthorized } = await import('./_auth.js')
    mockVerifyCaller.mockRejectedValue(new Unauthorized('invalid JWT'))
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'invalid JWT' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('returns 409 when auth.admin.createUser reports email collision', async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    })
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'email already exists' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('returns 500 when auth.admin.createUser fails for other reason', async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: 'network down' },
    })
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'auth-create failed: network down' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rolls back auth user and returns 403 when RPC raises 42501', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-2' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'caller 1 lacks create_users', code: '42501' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden: insufficient permission' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-2')
  })

  it('rolls back auth user and returns 422 when RPC raises 23502 (missing agency)', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-3' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'agency_id is required for role operator', code: '23502' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({ error: 'agency_id is required for role operator' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-3')
  })

  it('rolls back auth user and returns 500 for unmapped RPC error', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-4' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'something broke', code: 'XX000' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'rpc failed: something broke' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-4')
  })

  it('logs orphan when RPC fails AND deleteUser also fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-5' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'broken', code: 'XX000' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'auth api down' } })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(errorSpy).toHaveBeenCalledWith(
      '[create-staff] orphan auth.users (rollback failed):',
      'auth-uuid-5',
      'auth api down',
    )
    errorSpy.mockRestore()
  })

  it('returns 400 for missing required fields', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { p_email: 'a@b.c' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/missing/i)
    expect(mockCreateUser).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run api/admin/create-staff.test.js
```

Expected: failure with `Cannot find module './create-staff.js'` (the handler does not exist yet).

- [ ] **Step 3: Implement the handler**

Create `api/admin/create-staff.js`:

```javascript
// api/admin/create-staff.js
import { verifyCaller, Unauthorized } from './_auth.js'
import { getSupabaseAdmin } from './_supabase.js'

const REQUIRED_FIELDS = [
  'p_email',
  'p_password',
  'p_role',
  'p_first_name',
  'p_last_name',
]

function send(res, status, payload) {
  return res.status(status).json(payload)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' })
  }

  let caller
  try {
    caller = await verifyCaller(req)
  } catch (e) {
    if (e instanceof Unauthorized) {
      return send(res, 401, { error: e.message })
    }
    return send(res, 500, { error: e.message || 'auth check failed' })
  }
  void caller // permission check is delegated to the RPC

  const body = req.body || {}
  for (const k of REQUIRED_FIELDS) {
    if (body[k] == null || body[k] === '') {
      return send(res, 400, { error: `missing required field: ${k}` })
    }
  }

  const sb = getSupabaseAdmin()

  const { data: createData, error: createErr } = await sb.auth.admin.createUser({
    email: body.p_email,
    password: body.p_password,
    email_confirm: true,
  })

  if (createErr) {
    const msg = createErr.message || ''
    const isCollision =
      createErr.code === 'email_exists' ||
      /already been registered/i.test(msg) ||
      /already registered/i.test(msg)
    if (isCollision) {
      return send(res, 409, { error: 'email already exists' })
    }
    return send(res, 500, { error: `auth-create failed: ${msg}` })
  }

  const authUserId = createData?.user?.id
  if (!authUserId) {
    return send(res, 500, { error: 'auth-create failed: missing user id' })
  }

  const rpcArgs = { ...body, p_auth_user_id: authUserId }
  const { data: rpcData, error: rpcErr } = await sb.rpc('create_staff', rpcArgs)

  if (rpcErr) {
    const { error: delErr } = await sb.auth.admin.deleteUser(authUserId)
    if (delErr) {
      console.error(
        '[create-staff] orphan auth.users (rollback failed):',
        authUserId,
        delErr.message,
      )
    }
    if (rpcErr.code === '42501') {
      return send(res, 403, { error: 'forbidden: insufficient permission' })
    }
    if (rpcErr.code === '23502' || rpcErr.code === '23514') {
      return send(res, 422, { error: rpcErr.message })
    }
    return send(res, 500, { error: `rpc failed: ${rpcErr.message}` })
  }

  return send(res, 200, { data: { id: rpcData } })
}

export const config = { runtime: 'nodejs' }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run api/admin/create-staff.test.js
```

Expected: 9 tests pass.

If any test fails, do not proceed. Read the failure, fix the handler, rerun. Common pitfalls: the `Unauthorized` class import in tests must be re-imported AFTER `vi.mock('./_auth.js', ...)` (the test does this); the body field check should happen *after* `verifyCaller` so the 401 case isn't shadowed by 400.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

```bash
npx vitest run
```

Expected: all existing tests still pass plus the 9 new ones. If existing tests fail because of our `vi.mock` calls leaking, scope the mocks more tightly.

- [ ] **Step 6: Commit**

```bash
git add api/admin/create-staff.js api/admin/create-staff.test.js
git commit -m "feat(staff): /api/admin/create-staff endpoint with auth.users rollback"
```

---

## Task 3: Wire the frontend through `adminFetch`

**Files:**
- Modify: `src/components/staff/CreateStaffSlideOut.jsx` (the `handleSubmit` block around lines 81-118)

The component currently calls `supabase.rpc('create_staff', rpcArgs)` directly. We replace that single call with `adminFetch('/api/admin/create-staff', rpcArgs)` and adjust the success/error handling. The `get_staff_detail` follow-up RPC stays as-is.

- [ ] **Step 1: Read the current handleSubmit block**

```bash
sed -n '80,120p' src/components/staff/CreateStaffSlideOut.jsx
```

Confirm the `rpcArgs` shape matches what the endpoint expects (it does — the keys are already `p_email`, `p_password`, etc., matching the RPC parameter names).

- [ ] **Step 2: Add the adminFetch import at the top of the file**

Find the existing imports (around line 1-10) and add:

```jsx
import { adminFetch } from '../../lib/adminFetch'
```

If the relative path differs (e.g. the file is nested deeper), confirm with `find src/lib/adminFetch.js` and adjust.

- [ ] **Step 3: Replace the RPC call with adminFetch and add error mapping**

Replace lines 100-106 (the `supabase.rpc('create_staff', rpcArgs)` call and its `if (rpcError)` block) with:

```jsx
const { data: createRes, error: createErr } = await adminFetch(
  '/api/admin/create-staff',
  rpcArgs,
)

if (createErr) {
  setError(mapCreateStaffError(createErr.message))
  setSubmitting(false)
  return
}
const newId = createRes.id
```

The existing `get_staff_detail` follow-up call (which uses `newId`) stays unchanged.

- [ ] **Step 4: Add the error-mapping helper near the top of the component (above the export)**

```jsx
function mapCreateStaffError(message) {
  if (!message) return 'Не удалось создать сотрудника. Попробуйте ещё раз.'
  if (/email already exists/i.test(message)) return 'Этот email уже используется'
  if (/forbidden/i.test(message)) return 'Нет прав на создание пользователей'
  // RPC validation messages (22-prefixed codes) come through verbatim and are
  // already user-readable for the operator/admin/agency cases.
  return message
}
```

Place it after imports, before the `export default function CreateStaffSlideOut(...)` declaration so it isn't recreated per render.

- [ ] **Step 5: Manually verify the diff is minimal**

```bash
git diff src/components/staff/CreateStaffSlideOut.jsx
```

Expected diff: one new import line, one new top-level helper function, and the swapped 5-7 lines inside `handleSubmit`. No other changes — leave permission checkboxes, agency multi-select, and the `useMemo`/state hooks alone.

- [ ] **Step 6: Run the existing component test**

```bash
npx vitest run src/components/staff/CreateStaffSlideOut.test.jsx
```

If the test mocks `supabase.rpc('create_staff')`, it will now fail because the component no longer calls that path. Update the test to mock `adminFetch` instead:

```jsx
// Inside CreateStaffSlideOut.test.jsx, replace any vi.mock for supabase.rpc
// related to create_staff with:
vi.mock('../../lib/adminFetch', () => ({
  adminFetch: vi.fn().mockResolvedValue({ data: { id: 999 }, error: null }),
}))
```

Re-read the test file first to find the existing mock setup; the exact edit depends on its structure. The `get_staff_detail` mock stays as-is.

- [ ] **Step 7: Run the test until green**

```bash
npx vitest run src/components/staff/CreateStaffSlideOut.test.jsx
```

Expected: pass.

- [ ] **Step 8: Run the full suite**

```bash
npx vitest run
```

Expected: all tests green (pre-existing + new + updated).

- [ ] **Step 9: Commit**

```bash
git add src/components/staff/CreateStaffSlideOut.jsx src/components/staff/CreateStaffSlideOut.test.jsx
git commit -m "feat(staff): CreateStaffSlideOut posts to /api/admin/create-staff"
```

---

## Task 4: Pre-deploy data cleanup

**Files:**
- Manual SQL in Supabase Studio (no code changes)

Three test rows (`id IN (18,19,20)`) created via the broken UI flow have no `auth_user_id` and cannot log in. They must be removed before the new endpoint goes live so we don't leave them dangling — they'll be re-created post-deploy as part of smoke testing.

- [ ] **Step 1: Verify the three rows are still the only stranded entries**

In Supabase Studio:

```sql
SELECT id, email, role, created_at
FROM dashboard_users
WHERE auth_user_id IS NULL AND is_active = true
ORDER BY created_at DESC;
```

If only ids 18, 19, 20 appear, proceed. If others appear, stop and triage — the plan's cleanup scope is exactly those three (per spec section "Pre-deploy data cleanup"). Do not auto-delete unfamiliar rows.

- [ ] **Step 2: Delete the three test rows**

```sql
DELETE FROM dashboard_users WHERE id IN (18, 19, 20);
```

Expected: `DELETE 3`. The `user_permissions.user_id` FK has `ON DELETE CASCADE`, so dependent permission rows are removed automatically. `agency_id` is a column value, not an inbound FK, so no cascade affects it.

- [ ] **Step 3: Verify nothing else got deleted**

```sql
SELECT id, email, role
FROM dashboard_users
WHERE auth_user_id IS NULL AND is_active = true;
```

Expected: 0 rows.

---

## Task 5: Deploy and smoke

**Files:**
- No code changes — invokes Vercel CLI and the production UI.

After Tasks 1-4 are complete and Task 1's migration has been applied to production Postgres, deploy and smoke-test.

- [ ] **Step 1: Confirm we are on `main` with all commits merged (PR step happens in Task 6, but we deploy from main once merged)**

The deploy step here runs *after* the PR merges (Task 6). Skip this task during initial implementation; come back after Task 6 lands.

- [ ] **Step 2: Deploy production**

```bash
vercel --prod --yes
```

Expected: `● Ready` in `Production deployments` listing within ~30s. Capture the deployment URL.

- [ ] **Step 3: Smoke test happy path**

In a browser (use the production domain `https://x100.luxe`):

1. Login as superadmin.
2. Open `/staff` → click "Создать".
3. Fill: email `smoke-operator@example.com`, password `SmokeTest1!`, role `operator`, agency = any visible one, name `Smoke Operator`.
4. Submit. Expect the slide-out to close and the new operator to appear in the list.
5. Logout. Login with `smoke-operator@example.com` / `SmokeTest1!`. Expect the dashboard to load (no "invalid JWT" red error).

- [ ] **Step 4: Smoke test email collision**

1. Login back as superadmin.
2. Try to create another operator with email `smoke-operator@example.com`.
3. Expect the form to surface "Этот email уже используется".

- [ ] **Step 5: Cleanup smoke artifacts**

Decide whether to keep `smoke-operator@example.com` (e.g. as a permanent QA user) or remove it. If removing, do it through the `/staff` UI (the existing `delete_staff` RPC handles both `dashboard_users` and `auth.users` in the post-cutover flow — confirm by checking the RPC definition before deleting; if it does not, file a follow-up rather than expanding this plan's scope).

- [ ] **Step 6: Re-create the three originally-stranded test users via the new flow (optional but recommended)**

Use `/staff` to create:
- `modertest@gmail.com` / chosen password / role moderator
- `tlider@gmail.com` / chosen password / role teamlead
- `oper1@gmail.com` (note: corrected typo from `oper1@gmail.om`) / chosen password / role operator

Confirm each can log in. This restores the test-user inventory the team had before the cleanup.

---

## Task 6: PR and merge

**Files:**
- No code changes — git/GitHub operations.

- [ ] **Step 1: Push the branch**

If the implementing engineer worked on `main` directly (single-environment workflow per `project_auth_security_gap.md`), create a feature branch retroactively:

```bash
git checkout -b feat/create-staff-auth-fix
git push -u origin feat/create-staff-auth-fix
```

If they worked on a feature branch from the start, just push it.

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(staff): create_staff also creates auth.users (auth fix)" --body "$(cat <<'EOF'
## Summary
- Add new endpoint `/api/admin/create-staff` that creates an `auth.users` row via service-role admin API and links it to the `dashboard_users` row inserted by the RPC.
- Migration 115 extends `create_staff` with `p_auth_user_id` and writes it to `dashboard_users.auth_user_id`.
- Frontend `CreateStaffSlideOut` posts to the endpoint instead of calling the RPC directly.
- Best-effort rollback: if the RPC fails after `auth.users` is created, the auth row is deleted; orphan is logged on cleanup failure.

## Test plan
- [x] `npx vitest run api/admin/create-staff.test.js` — 9 unit cases (success, 401/403/409/422/500 paths, rollback).
- [x] `npx vitest run` — full suite green.
- [ ] Production smoke: create operator → log in as operator → create duplicate → see "Этот email уже используется".
- [ ] Three stranded test users (ids 18/19/20) deleted pre-deploy; recreated through new flow post-deploy.

## Notes
- Spec: `docs/superpowers/specs/2026-05-04-create-staff-auth-fix-design.md`.
- Stage 16 (drop `dashboard_users.password_hash`) deferred — out of scope.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge after CI passes**

Per `project_gh_auth.md`, `gh pr merge` fails under `temashdesign`. Switch first:

```bash
gh auth switch --user clubmonaco2017-ops
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Pull main locally**

```bash
git checkout main
git pull origin main
```

Then proceed to Task 5 (deploy + smoke).

---

## Self-review notes (filled by writing-plans)

- **Spec coverage:** every spec section maps to a task — RPC migration → Task 1; endpoint contract + tests → Task 2; frontend wiring → Task 3; pre-deploy cleanup → Task 4; deploy + smoke → Task 5; merge process → Task 6. Out-of-scope items (Stage 16, invite-link, `update_staff_profile` email sync) are explicitly excluded in the spec and not present in any task.
- **Placeholder scan:** no "TBD" / "TODO" / "implement later" patterns; all code blocks are runnable as written. The single placeholder-like instruction is "Place it after imports, before the `export default function ...` declaration" in Task 3 Step 4 — that's a position directive, not a code placeholder.
- **Type consistency:** `mockCreateUser` / `mockRpc` / `mockDeleteUser` names are stable across all test cases. The handler imports `verifyCaller` and `Unauthorized` (matching `_auth.js` exports) and `getSupabaseAdmin` (matching `_supabase.js`). RPC parameter name `p_auth_user_id` matches between Task 1 (migration) and Task 2 (endpoint passes it). Response shape `{ data: { id } }` is consistent with `adminFetch`'s contract verified in `src/lib/adminFetch.js`.
