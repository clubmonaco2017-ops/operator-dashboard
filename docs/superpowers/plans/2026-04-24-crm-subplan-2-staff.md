# CRM Subplan 2 — Staff Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy `AdminPanel.jsx` with a full staff-management section (`/staff` list, `/staff/new` create, `/staff/:refCode` detail with tabs, `/notifications` for deletion approvals). Close the Foundation-era gap where creating a user via AdminPanel didn't populate `user_permissions` rows.

**Architecture:** React Router for client-side routing; dedicated pages per role-centric view instead of modals; mobile-first responsive. New Supabase RPCs (`create_staff`, `update_staff_profile`, `list_staff`, `get_staff_detail`, deletion workflow) replace `/api/admin/*` endpoints. A new `deletion_requests` table tracks admin-initiated deletions that require superadmin approval. Two optional contact columns added to `dashboard_users` as placeholder for future UI fields. All new components support light and dark themes via Tailwind tokens.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, shadcn/ui (via shadcnblocks Premium registry), react-router-dom v7, Supabase (PostgreSQL + RPC), Vitest, @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-04-24-crm-subplan-2-staff-design.md`](../specs/2026-04-24-crm-subplan-2-staff-design.md)

**Prerequisites:**
- Foundation (Subplan 1) migrations applied to Supabase `akpddaqpggktefkdecrl`.
- On branch `crm-foundation` (continuation) or a new branch `crm-staff` off `crm-foundation`.
- `.env.local` with `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY`.

---

## File structure

### Create
- `db/migrations/20260424_09_deletion_requests_and_contacts.sql`
- `db/migrations/20260424_10_rpc_staff_crud.sql`
- `db/migrations/20260424_11_rpc_deletion_workflow.sql`
- `src/lib/defaultPermissions.js`
- `src/lib/defaultPermissions.test.js`
- `src/lib/permissionGroups.js`
- `src/lib/permissionGroups.test.js`
- `src/components/Sidebar.jsx`
- `src/components/staff/StaffFilterChips.jsx`
- `src/components/staff/StaffFilterChips.test.jsx`
- `src/components/staff/RefCodePreview.jsx`
- `src/components/staff/RefCodePreview.test.jsx`
- `src/components/staff/StaffTable.jsx`
- `src/components/staff/StaffCardList.jsx`
- `src/components/staff/StaffPageShell.jsx`
- `src/components/staff/ProfileTab.jsx`
- `src/components/staff/AttributesTab.jsx`
- `src/components/staff/PermissionsTab.jsx`
- `src/components/staff/PermissionsTab.test.jsx`
- `src/components/staff/ActivityTab.jsx`
- `src/components/staff/ChangePasswordModal.jsx`
- `src/components/staff/DeleteRequestModal.jsx`
- `src/components/staff/DeleteRequestModal.test.jsx`
- `src/components/staff/ApprovalReviewModal.jsx`
- `src/hooks/useStaffList.js`
- `src/hooks/useStaff.js`
- `src/hooks/useDeletionRequests.js`
- `src/hooks/usePendingDeletionCount.js`
- `src/pages/StaffListPage.jsx`
- `src/pages/StaffCreatePage.jsx`
- `src/pages/StaffDetailPage.jsx`
- `src/pages/NotificationsPage.jsx`
- `src/pages/DashboardPage.jsx` (extracted from current `App.jsx`)

### Modify
- `src/App.jsx` — replace with Router shell
- `src/main.jsx` — wrap in `<BrowserRouter>` (if not already)
- `package.json` / `package-lock.json` — add `react-router-dom`
- `NOTES.md` — section "Subplan 2 complete"

### Delete
- `src/AdminPanel.jsx`
- `src/AdminLayout.jsx`
- `src/sections/AgenciesSection.jsx`
- `src/sections/ClientsSection.jsx`
- `src/sections/ManagersSection.jsx`
- `src/sections/PlatformsSection.jsx`
- `api/admin/_supabase.js`
- `api/admin/create-user.js`
- `api/admin/deactivate-user.js`
- `api/admin/list-users.js`
- `api/admin/update-password.js`
- `api/admin/update-permissions.js`

---

## Task 1: Install react-router-dom

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

Run:
```bash
cd /Users/artemsaskin/Work/operator-dashboard
npm install react-router-dom@^7
```
Expected: adds `react-router-dom` to `dependencies`, no errors.

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "console.log(require('react-router-dom/package.json').version)"
```
Expected: prints a version string like `7.x.x`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-router-dom"
```

---

## Task 2: Migration 09 — deletion_requests table and contact fields

**Files:**
- Create: `db/migrations/20260424_09_deletion_requests_and_contacts.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 09: deletion_requests table + optional contact fields on dashboard_users
-- Deletion workflow: admin requests deletion with reason → superadmin approves/rejects.
-- Contact fields: placeholder nullable columns for future UI (phone, telegram, notes).

BEGIN;

-- Contact fields (all nullable, no default)
ALTER TABLE dashboard_users
  ADD COLUMN IF NOT EXISTS phone    text,
  ADD COLUMN IF NOT EXISTS telegram text,
  ADD COLUMN IF NOT EXISTS notes    text;

-- Deletion requests
CREATE TABLE IF NOT EXISTS deletion_requests (
  id            serial PRIMARY KEY,
  target_user   integer NOT NULL REFERENCES dashboard_users(id),
  requested_by  integer NOT NULL REFERENCES dashboard_users(id),
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   integer REFERENCES dashboard_users(id),
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_pending
  ON deletion_requests(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_target
  ON deletion_requests(target_user);

ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;

COMMIT;

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='dashboard_users' AND column_name IN ('phone','telegram','notes');
--   -- Expected: 3 rows.
--
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='deletion_requests' ORDER BY ordinal_position;
--   -- Expected: 10 rows.
--
-- ROLLBACK:
--   DROP TABLE deletion_requests;
--   ALTER TABLE dashboard_users DROP COLUMN phone, DROP COLUMN telegram, DROP COLUMN notes;
```

- [ ] **Step 2: Apply in Supabase**

Open https://supabase.com/dashboard/project/akpddaqpggktefkdecrl/sql/new, paste the SQL, Run. Expected: "Success. No rows returned".

- [ ] **Step 3: Verify**

Run these queries in SQL editor:
```sql
SELECT column_name FROM information_schema.columns
  WHERE table_name='dashboard_users' AND column_name IN ('phone','telegram','notes');
```
Expected: 3 rows.

```sql
SELECT count(*) FROM information_schema.columns WHERE table_name='deletion_requests';
```
Expected: 10.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260424_09_deletion_requests_and_contacts.sql
git commit -m "db: migration 09 — deletion_requests table and contact fields"
```

---

## Task 3: Migration 10 — Staff CRUD RPC functions

**Files:**
- Create: `db/migrations/20260424_10_rpc_staff_crud.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 10: Staff CRUD RPC functions
--   create_staff           — create user + assign default permissions (atomic)
--   update_staff_profile   — edit first/last/alias/email
--   list_staff             — list with pre-joined permissions + attributes + pending flag
--   get_staff_detail       — single user with permissions + attributes + pending flag

BEGIN;

-- Helper: generate next ref_code for a given role
-- Reads MAX(ref_code numeric suffix) for the role, returns +1 padded to 3 digits.
CREATE OR REPLACE FUNCTION _next_ref_code(
  p_role text, p_first_name text, p_last_name text
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_next   int;
  v_first  text;
  v_last   text;
BEGIN
  v_prefix := CASE p_role
    WHEN 'superadmin' THEN 'SA'
    WHEN 'admin'      THEN 'ADM'
    WHEN 'moderator'  THEN 'MOD'
    WHEN 'teamlead'   THEN 'TL'
    WHEN 'operator'   THEN 'OP'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Unknown role: %', p_role;
  END IF;

  SELECT COALESCE(MAX(
    CASE
      WHEN ref_code ~ ('^' || v_prefix || '-.+-\d{3}$')
        THEN (regexp_replace(ref_code, '.*-(\d{3})$', '\1'))::int
      ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM dashboard_users
  WHERE role = p_role;

  IF v_next > 999 THEN
    RAISE EXCEPTION 'Ref code number exceeded 999 for role %', p_role;
  END IF;

  v_first := upper(left(p_first_name, 1)) || lower(substring(p_first_name, 2));
  v_last  := upper(left(p_last_name, 1));

  RETURN v_prefix || '-' || v_first || v_last || '-' || lpad(v_next::text, 3, '0');
END $$;

-- create_staff: creates a new user row, generates ref_code, grants permissions.
-- Returns the new user's id.
CREATE OR REPLACE FUNCTION create_staff(
  p_caller_id integer,
  p_email text,
  p_password text,
  p_role text,
  p_first_name text,
  p_last_name text,
  p_alias text,
  p_permissions text[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id   integer;
  v_ref_code text;
  v_perm     text;
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
  END IF;

  IF p_role NOT IN ('admin','moderator','teamlead','operator') THEN
    RAISE EXCEPTION 'Invalid role for create_staff: %', p_role;
  END IF;

  v_ref_code := _next_ref_code(p_role, p_first_name, p_last_name);

  INSERT INTO dashboard_users (
    email, password_hash, role,
    first_name, last_name, alias, ref_code,
    created_by, permissions
  ) VALUES (
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_first_name, p_last_name, p_alias, v_ref_code,
    p_caller_id,
    '{}'::jsonb
  )
  RETURNING id INTO v_new_id;

  -- Grant each permission in the passed array
  IF p_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_permissions LOOP
      INSERT INTO user_permissions (user_id, permission, granted_by, granted_at)
        VALUES (v_new_id, v_perm, p_caller_id, now())
      ON CONFLICT (user_id, permission) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_new_id;
END $$;

GRANT EXECUTE ON FUNCTION create_staff(integer,text,text,text,text,text,text,text[])
  TO anon, authenticated;

-- update_staff_profile: edit first_name, last_name, alias, email.
-- Ref_code and role are NOT editable here.
CREATE OR REPLACE FUNCTION update_staff_profile(
  p_caller_id integer,
  p_user_id integer,
  p_first_name text,
  p_last_name text,
  p_alias text,
  p_email text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot edit user %', p_caller_id, p_user_id;
  END IF;

  UPDATE dashboard_users
  SET first_name = COALESCE(p_first_name, first_name),
      last_name  = COALESCE(p_last_name, last_name),
      alias      = p_alias,
      email      = COALESCE(p_email, email)
  WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION update_staff_profile(integer,integer,text,text,text,text)
  TO anon, authenticated;

-- list_staff: list with pre-joined permissions, attributes, and pending-deletion flag.
CREATE OR REPLACE FUNCTION list_staff(p_caller_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE has_permission(p_caller_id, 'create_users')
  ORDER BY u.role, u.ref_code;
$$;

GRANT EXECUTE ON FUNCTION list_staff(integer) TO anon, authenticated;

-- get_staff_detail: single row with same shape as list_staff.
CREATE OR REPLACE FUNCTION get_staff_detail(p_caller_id integer, p_user_id integer)
RETURNS TABLE (
  id          integer,
  ref_code    text,
  first_name  text,
  last_name   text,
  alias       text,
  email       text,
  role        text,
  is_active   boolean,
  tableau_id  text,
  created_at  timestamptz,
  permissions text[],
  attributes  jsonb,
  has_pending_deletion boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id, u.ref_code, u.first_name, u.last_name, u.alias, u.email,
    u.role, u.is_active, u.tableau_id, u.created_at,
    COALESCE(
      (SELECT array_agg(permission ORDER BY permission) FROM user_permissions WHERE user_id = u.id),
      ARRAY[]::text[]
    ) AS permissions,
    COALESCE(
      (SELECT jsonb_object_agg(key, value) FROM user_attributes WHERE user_id = u.id),
      '{}'::jsonb
    ) AS attributes,
    EXISTS(
      SELECT 1 FROM deletion_requests dr
      WHERE dr.target_user = u.id AND dr.status = 'pending'
    ) AS has_pending_deletion
  FROM dashboard_users u
  WHERE u.id = p_user_id
    AND (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users'));
$$;

GRANT EXECUTE ON FUNCTION get_staff_detail(integer, integer) TO anon, authenticated;

-- change_staff_password: bcrypt-hash new password. Self or create_users gates.
CREATE OR REPLACE FUNCTION change_staff_password(
  p_caller_id integer, p_user_id integer, p_new_password text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT (p_caller_id = p_user_id OR has_permission(p_caller_id, 'create_users')) THEN
    RAISE EXCEPTION 'caller % cannot change password for %', p_caller_id, p_user_id;
  END IF;
  UPDATE dashboard_users
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION change_staff_password(integer, integer, text) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   -- Create a test admin, then:
--   SELECT create_staff(<sa_id>, 'test@example.com', 'secret123', 'moderator',
--                       'Тест', 'Юзеров', NULL, ARRAY['create_tasks','view_all_tasks']);
--   -- Expected: returns integer id.
--
--   SELECT ref_code FROM dashboard_users WHERE email='test@example.com';
--   -- Expected: MOD-Тест<smth>-NNN
--
--   SELECT * FROM list_staff(<sa_id>);
--   -- Expected: rows include the new test user with permissions array and attributes jsonb.
--
--   SELECT * FROM get_staff_detail(<sa_id>, <new_id>);
--   -- Expected: single row.
--
-- ROLLBACK:
--   DROP FUNCTION create_staff(integer,text,text,text,text,text,text,text[]);
--   DROP FUNCTION update_staff_profile(integer,integer,text,text,text,text);
--   DROP FUNCTION list_staff(integer);
--   DROP FUNCTION get_staff_detail(integer,integer);
--   DROP FUNCTION change_staff_password(integer,integer,text);
--   DROP FUNCTION _next_ref_code(text,text,text);
```

- [ ] **Step 2: Apply in Supabase**

Paste and Run. Expected: Success.

- [ ] **Step 3: Verify functions exist**

```sql
SELECT proname FROM pg_proc
  WHERE proname IN ('create_staff','update_staff_profile','list_staff','get_staff_detail','change_staff_password','_next_ref_code')
  ORDER BY proname;
```
Expected: 6 rows.

- [ ] **Step 4: Smoke-test create_staff**

Find a superadmin id first:
```sql
SELECT id FROM dashboard_users WHERE role='superadmin' LIMIT 1;
```

Then (replace `1` with the actual sa_id):
```sql
SELECT create_staff(1, 'smoke-test@example.com', 'smokepass123', 'moderator',
                    'Смоук', 'Тест', NULL,
                    ARRAY['create_tasks','view_all_tasks']);
```
Expected: returns an integer id.

Verify:
```sql
SELECT ref_code, first_name, last_name, role FROM dashboard_users
  WHERE email='smoke-test@example.com';
```
Expected: ref_code starts with `MOD-`, first_name='Смоук', last_name='Тест'.

```sql
SELECT permission FROM user_permissions
  WHERE user_id = (SELECT id FROM dashboard_users WHERE email='smoke-test@example.com')
  ORDER BY permission;
```
Expected: 2 rows — `create_tasks`, `view_all_tasks`.

- [ ] **Step 5: Cleanup test user**

```sql
DELETE FROM user_permissions
  WHERE user_id = (SELECT id FROM dashboard_users WHERE email='smoke-test@example.com');
DELETE FROM dashboard_users WHERE email='smoke-test@example.com';
```

- [ ] **Step 6: Commit**

```bash
git add db/migrations/20260424_10_rpc_staff_crud.sql
git commit -m "db: migration 10 — staff CRUD RPC (create_staff, list_staff, update_staff_profile, get_staff_detail, change_staff_password)"
```

---

## Task 4: Migration 11 — deletion workflow + deactivate RPCs

**Files:**
- Create: `db/migrations/20260424_11_rpc_deletion_workflow.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 11: deletion workflow and deactivate RPCs
--   request_deletion       — admin creates a pending deletion request
--   approve_deletion       — superadmin: approves → deactivates target
--   reject_deletion        — superadmin: rejects → leaves target active
--   list_deletion_requests — superadmin only, filter by status
--   deactivate_staff       — superadmin direct deactivation

BEGIN;

CREATE OR REPLACE FUNCTION request_deletion(
  p_caller_id integer, p_target_user integer, p_reason text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id integer;
BEGIN
  IF NOT has_permission(p_caller_id, 'create_users') THEN
    RAISE EXCEPTION 'caller % lacks create_users', p_caller_id;
  END IF;
  IF p_target_user = p_caller_id THEN
    RAISE EXCEPTION 'cannot request deletion of self';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 20 THEN
    RAISE EXCEPTION 'reason must be at least 20 characters';
  END IF;
  IF EXISTS (
    SELECT 1 FROM deletion_requests
    WHERE target_user = p_target_user AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'pending deletion request already exists for user %', p_target_user;
  END IF;
  INSERT INTO deletion_requests (target_user, requested_by, reason, status)
    VALUES (p_target_user, p_caller_id, p_reason, 'pending')
    RETURNING id INTO v_request_id;
  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION request_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION approve_deletion(
  p_caller_id integer, p_request_id integer, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can approve deletion';
  END IF;
  UPDATE deletion_requests
  SET status = 'approved',
      reviewed_by = p_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING target_user INTO v_target;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'request % not found or not pending', p_request_id;
  END IF;
  UPDATE dashboard_users SET is_active = false WHERE id = v_target;
END $$;

GRANT EXECUTE ON FUNCTION approve_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION reject_deletion(
  p_caller_id integer, p_request_id integer, p_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'only superadmin can reject deletion';
  END IF;
  UPDATE deletion_requests
  SET status = 'rejected',
      reviewed_by = p_caller_id,
      review_note = p_note,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';
END $$;

GRANT EXECUTE ON FUNCTION reject_deletion(integer, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION list_deletion_requests(
  p_caller_id integer, p_status text DEFAULT 'pending'
) RETURNS TABLE (
  id integer,
  target_user integer,
  target_ref_code text,
  target_full_name text,
  target_email text,
  target_role text,
  requested_by integer,
  requested_by_ref_code text,
  requested_by_full_name text,
  reason text,
  status text,
  reviewed_by integer,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id, dr.target_user, tu.ref_code, (tu.first_name || ' ' || tu.last_name),
    tu.email, tu.role,
    dr.requested_by, ru.ref_code, (ru.first_name || ' ' || ru.last_name),
    dr.reason, dr.status, dr.reviewed_by, dr.review_note,
    dr.created_at, dr.reviewed_at
  FROM deletion_requests dr
  JOIN dashboard_users tu ON tu.id = dr.target_user
  JOIN dashboard_users ru ON ru.id = dr.requested_by
  WHERE EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin')
    AND (p_status IS NULL OR dr.status = p_status)
  ORDER BY dr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_deletion_requests(integer, text) TO anon, authenticated;

-- Count-only helper for sidebar badge
CREATE OR REPLACE FUNCTION count_pending_deletions(p_caller_id integer)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*)::integer, 0)
  FROM deletion_requests
  WHERE status = 'pending'
    AND EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin');
$$;

GRANT EXECUTE ON FUNCTION count_pending_deletions(integer) TO anon, authenticated;

-- Direct deactivation (for superadmin)
CREATE OR REPLACE FUNCTION deactivate_staff(p_caller_id integer, p_user_id integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    p_caller_id = p_user_id
    OR EXISTS (SELECT 1 FROM dashboard_users WHERE id = p_caller_id AND role = 'superadmin')
  ) THEN
    RAISE EXCEPTION 'only superadmin or self can deactivate';
  END IF;
  UPDATE dashboard_users SET is_active = false WHERE id = p_user_id;
END $$;

GRANT EXECUTE ON FUNCTION deactivate_staff(integer, integer) TO anon, authenticated;

COMMIT;

-- VERIFY:
--   -- With a test admin (non-superadmin), call request_deletion on any user:
--   SELECT request_deletion(<admin_id>, <target_id>, 'Sufficiently long reason here for test');
--   -- Expected: integer request id.
--   -- Check:
--   SELECT * FROM list_deletion_requests(<sa_id>);
--   -- Expected: 1 row.
--   -- Approve:
--   SELECT approve_deletion(<sa_id>, <request_id>, 'approved for test');
--   -- Target should be is_active=false.
--
-- ROLLBACK:
--   DROP FUNCTION request_deletion(integer,integer,text);
--   DROP FUNCTION approve_deletion(integer,integer,text);
--   DROP FUNCTION reject_deletion(integer,integer,text);
--   DROP FUNCTION list_deletion_requests(integer,text);
--   DROP FUNCTION count_pending_deletions(integer);
--   DROP FUNCTION deactivate_staff(integer,integer);
```

- [ ] **Step 2: Apply in Supabase**

Paste and Run. Expected: Success.

- [ ] **Step 3: Verify functions exist**

```sql
SELECT proname FROM pg_proc
  WHERE proname IN ('request_deletion','approve_deletion','reject_deletion',
                    'list_deletion_requests','count_pending_deletions','deactivate_staff')
  ORDER BY proname;
```
Expected: 6 rows.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260424_11_rpc_deletion_workflow.sql
git commit -m "db: migration 11 — deletion workflow and deactivate RPCs"
```

---

## Task 5: `defaultPermissions` utility (TDD)

**Files:**
- Create: `src/lib/defaultPermissions.js`
- Create: `src/lib/defaultPermissions.test.js`

- [ ] **Step 1: Write the failing test**

File `src/lib/defaultPermissions.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { defaultPermissions } from './defaultPermissions.js'

describe('defaultPermissions', () => {
  it('returns admin defaults', () => {
    expect(defaultPermissions('admin')).toEqual([
      'create_tasks',
      'manage_teams',
      'send_reminders',
      'view_all_revenue',
      'view_all_tasks',
    ])
  })

  it('returns moderator defaults', () => {
    expect(defaultPermissions('moderator')).toEqual([
      'create_tasks',
      'view_own_tasks',
      'view_team_revenue',
    ])
  })

  it('returns teamlead defaults', () => {
    expect(defaultPermissions('teamlead')).toEqual([
      'create_tasks',
      'manage_teams',
      'view_own_tasks',
      'view_team_revenue',
    ])
  })

  it('returns operator defaults', () => {
    expect(defaultPermissions('operator')).toEqual([
      'view_own_revenue',
      'view_own_tasks',
    ])
  })

  it('returns empty array for unknown role', () => {
    expect(defaultPermissions('unknown')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
npm run test:run -- src/lib/defaultPermissions
```
Expected: FAIL (module not found).

- [ ] **Step 3: Write implementation**

File `src/lib/defaultPermissions.js`:

```javascript
const DEFAULTS = {
  admin: [
    'create_tasks',
    'manage_teams',
    'send_reminders',
    'view_all_revenue',
    'view_all_tasks',
  ],
  moderator: [
    'create_tasks',
    'view_own_tasks',
    'view_team_revenue',
  ],
  teamlead: [
    'create_tasks',
    'manage_teams',
    'view_own_tasks',
    'view_team_revenue',
  ],
  operator: [
    'view_own_revenue',
    'view_own_tasks',
  ],
}

export function defaultPermissions(role) {
  return DEFAULTS[role] ?? []
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm run test:run -- src/lib/defaultPermissions`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/defaultPermissions.js src/lib/defaultPermissions.test.js
git commit -m "feat(lib): add defaultPermissions for each role with tests"
```

---

## Task 6: `permissionGroups` utility (TDD)

**Files:**
- Create: `src/lib/permissionGroups.js`
- Create: `src/lib/permissionGroups.test.js`

- [ ] **Step 1: Write the failing test**

File `src/lib/permissionGroups.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { permissionGroups, allKnownPermissions } from './permissionGroups.js'

describe('permissionGroups', () => {
  it('exports at least three categories', () => {
    expect(permissionGroups.length).toBeGreaterThanOrEqual(3)
  })

  it('each group has title and permissions array', () => {
    for (const group of permissionGroups) {
      expect(typeof group.title).toBe('string')
      expect(Array.isArray(group.permissions)).toBe(true)
      for (const perm of group.permissions) {
        expect(typeof perm.key).toBe('string')
        expect(typeof perm.label).toBe('string')
      }
    }
  })

  it('all known permissions appear exactly once across groups', () => {
    const seen = {}
    for (const group of permissionGroups) {
      for (const perm of group.permissions) {
        expect(seen[perm.key]).toBeUndefined()
        seen[perm.key] = true
      }
    }
  })

  it('allKnownPermissions returns flattened unique keys', () => {
    expect(allKnownPermissions().length).toBe(
      permissionGroups.reduce((s, g) => s + g.permissions.length, 0),
    )
    expect(allKnownPermissions()).toContain('create_users')
    expect(allKnownPermissions()).toContain('view_all_revenue')
  })
})
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm run test:run -- src/lib/permissionGroups`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

File `src/lib/permissionGroups.js`:

```javascript
export const permissionGroups = [
  {
    title: 'Администрирование',
    permissions: [
      { key: 'create_users', label: 'Создавать сотрудников' },
      { key: 'manage_roles', label: 'Управлять ролями и правами' },
      { key: 'manage_teams', label: 'Управлять командами' },
      { key: 'send_reminders', label: 'Отправлять напоминания' },
    ],
  },
  {
    title: 'Задачи',
    permissions: [
      { key: 'create_tasks',   label: 'Создавать задачи' },
      { key: 'view_all_tasks', label: 'Видеть все задачи' },
      { key: 'view_own_tasks', label: 'Видеть свои задачи' },
    ],
  },
  {
    title: 'Просмотр выручки',
    permissions: [
      { key: 'view_all_revenue',  label: 'Вся выручка' },
      { key: 'view_team_revenue', label: 'Выручка команды / смены' },
      { key: 'view_own_revenue',  label: 'Своя выручка' },
    ],
  },
  {
    title: 'Прочее',
    permissions: [
      { key: 'use_chat', label: 'Внутренний чат' },
    ],
  },
]

export function allKnownPermissions() {
  return permissionGroups.flatMap((g) => g.permissions.map((p) => p.key))
}
```

- [ ] **Step 4: Run tests — pass**

Run: `npm run test:run -- src/lib/permissionGroups`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissionGroups.js src/lib/permissionGroups.test.js
git commit -m "feat(lib): add permissionGroups catalog with tests"
```

---

## Task 7: Extract `DashboardPage.jsx` from `App.jsx`

**Files:**
- Create: `src/pages/DashboardPage.jsx`
- Modify: `src/App.jsx` (export the current page body as a function)

Rationale: before adding router, isolate the existing dashboard UI as its own component so App.jsx becomes the routing shell.

- [ ] **Step 1: Make the pages folder**

```bash
mkdir -p /Users/artemsaskin/Work/operator-dashboard/src/pages
```

- [ ] **Step 2: Read current App.jsx structure**

Run:
```bash
wc -l src/App.jsx
head -60 src/App.jsx
```
Note the exported component name (likely `default export function App`) and the range of JSX that represents the dashboard body (everything that currently renders after the login check).

- [ ] **Step 3: Move the dashboard-specific component to `src/pages/DashboardPage.jsx`**

Copy the current `src/App.jsx` into `src/pages/DashboardPage.jsx`, then apply these transformations:

**a) Rename and export:**
- Rename the function from `function App()` (or whatever it's called) to `function DashboardPage()`
- Replace `export default function` with `export function` (named export)

**b) Remove from the function body:**
- Any `if (!user) return <LoginPage … />` block — router handles the login gate now
- Any `if (showAdmin) return <AdminPanel … />` block AND the `const [showAdmin, setShowAdmin] = useState(…)` hook AND the button handler that toggles it
- The `import LoginPage from './LoginPage'` line
- The `import AdminPanel from './AdminPanel'` line
- The `import AdminLayout from './AdminLayout'` line if present

**c) Replace the "Админ" button in the header:**
If there is a button that used to set `showAdmin = true`, replace it with a Link to `/staff`:

```jsx
import { Link } from 'react-router-dom'

// In the header JSX, wherever the old "Админ" button was:
{hasPermission(user, 'create_users') && (
  <Link
    to="/staff"
    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
  >
    Сотрудники
  </Link>
)}
```

**d) Fix import paths** — this file is now in `src/pages/` instead of `src/`, so every relative import must go up one directory:
- `'./useAuth'` → `'../useAuth.jsx'`
- `'./supabaseClient'` → `'../supabaseClient'`
- `'./lib/permissions.js'` → `'../lib/permissions.js'`
- `'./components/ui/button'` → `'../components/ui/button'`
- etc.

Run `grep -n "from '\\./" src/pages/DashboardPage.jsx` afterward — no result expected (all relative imports should now use `../`).

**e) Do NOT touch** the revenue table logic, charts, theme toggle, timezone selector, or any other existing dashboard functionality.

- [ ] **Step 4: Run build — catches import errors**

Run: `npm run build`
Expected: succeeds (nothing imports `DashboardPage` yet so it's just a module). If errors — fix relative imports.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.jsx
git commit -m "refactor: extract DashboardPage from App.jsx (preparation for router)"
```

---

## Task 8: Add router to `App.jsx` and wire LoginPage

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/main.jsx` (if needed, to wrap with `BrowserRouter`)

- [ ] **Step 1: Read `src/main.jsx`**

Run: `cat src/main.jsx`

If it contains `<App />` without a Router, we wrap it. If there's already a Router — confirm.

- [ ] **Step 2: Update `src/main.jsx` to include BrowserRouter**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```
(If the file already has extra providers, keep them; only add `<BrowserRouter>`.)

- [ ] **Step 3: Replace `src/App.jsx` with router shell**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'
import LoginPage from './LoginPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { StaffListPage } from './pages/StaffListPage.jsx'
import { StaffCreatePage } from './pages/StaffCreatePage.jsx'
import { StaffDetailPage } from './pages/StaffDetailPage.jsx'
import { NotificationsPage } from './pages/NotificationsPage.jsx'

export default function App() {
  const { user, login, loading } = useAuth()

  if (!user) {
    return <LoginPage onLogin={login} loading={loading} />
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/staff" element={<StaffListPage />} />
      <Route path="/staff/new" element={<StaffCreatePage />} />
      <Route path="/staff/:refCode" element={<StaffDetailPage />} />
      <Route path="/staff/:refCode/:tab" element={<StaffDetailPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

Note: the page components don't exist yet — for now, create placeholder files so the import resolves. (They will be replaced in later tasks.)

- [ ] **Step 4: Create placeholder pages**

```bash
cat > src/pages/StaffListPage.jsx <<'EOF'
export function StaffListPage() { return <div>StaffListPage placeholder</div> }
EOF
cat > src/pages/StaffCreatePage.jsx <<'EOF'
export function StaffCreatePage() { return <div>StaffCreatePage placeholder</div> }
EOF
cat > src/pages/StaffDetailPage.jsx <<'EOF'
export function StaffDetailPage() { return <div>StaffDetailPage placeholder</div> }
EOF
cat > src/pages/NotificationsPage.jsx <<'EOF'
export function NotificationsPage() { return <div>NotificationsPage placeholder</div> }
EOF
```

- [ ] **Step 5: Build & dev — smoke test**

```bash
npm run build
```
Expected: succeeds.

```bash
npm run dev
```
Open `http://localhost:5173`. Login. Expected: dashboard renders. Navigate to `http://localhost:5173/staff` — placeholder shows. Stop dev server.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/main.jsx src/pages/StaffListPage.jsx src/pages/StaffCreatePage.jsx src/pages/StaffDetailPage.jsx src/pages/NotificationsPage.jsx
git commit -m "feat(router): add react-router routes and page placeholders"
```

---

## Task 9: Sidebar component with nav links

**Files:**
- Create: `src/components/Sidebar.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { hasPermission, isSuperadmin } from '../lib/permissions.js'
import { usePendingDeletionCount } from '../hooks/usePendingDeletionCount.js'

const linkBase =
  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-600 text-white'
const linkIdle =
  'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'

export function Sidebar({ user, onLogout }) {
  const canSeeStaff = hasPermission(user, 'create_users')
  const canSeeNotifications = isSuperadmin(user)
  const pending = usePendingDeletionCount({ enabled: canSeeNotifications })

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {(user.alias || user.firstName || user.email) + ' '}
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            ({user.role})
          </span>
        </div>
        <div className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">
          {user.refCode}
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${linkBase} ${isActive ? linkActive : linkIdle}`
          }
        >
          Дашборд
        </NavLink>

        {canSeeStaff && (
          <NavLink
            to="/staff"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            Сотрудники
          </NavLink>
        )}

        {canSeeNotifications && (
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `${linkBase} ${isActive ? linkActive : linkIdle}`
            }
          >
            <span className="flex-1">Оповещения</span>
            {pending > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                {pending}
              </span>
            )}
          </NavLink>
        )}
      </nav>

      <button
        onClick={onLogout}
        className="mt-6 w-full rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Выйти
      </button>
    </aside>
  )
}
```

Note: `usePendingDeletionCount` will be implemented in Task 20. For now, create a stub file so the import doesn't fail.

- [ ] **Step 2: Stub `usePendingDeletionCount` hook**

```bash
mkdir -p /Users/artemsaskin/Work/operator-dashboard/src/hooks
```

```jsx
// src/hooks/usePendingDeletionCount.js
export function usePendingDeletionCount() {
  return 0
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.jsx src/hooks/usePendingDeletionCount.js
git commit -m "feat(ui): add Sidebar with role-aware nav links and badge slot"
```

---

## Task 10: `StaffFilterChips` component (TDD)

**Files:**
- Create: `src/components/staff/StaffFilterChips.jsx`
- Create: `src/components/staff/StaffFilterChips.test.jsx`

- [ ] **Step 1: Failing test**

```jsx
// src/components/staff/StaffFilterChips.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StaffFilterChips } from './StaffFilterChips.jsx'

const counts = { all: 10, admin: 2, moderator: 4, teamlead: 1, operator: 3 }

describe('<StaffFilterChips>', () => {
  it('renders chip for each role with counts', () => {
    render(<StaffFilterChips counts={counts} value="all" onChange={() => {}} />)
    expect(screen.getByText(/Все · 10/)).toBeInTheDocument()
    expect(screen.getByText(/Админы · 2/)).toBeInTheDocument()
    expect(screen.getByText(/Модераторы · 4/)).toBeInTheDocument()
    expect(screen.getByText(/ТЛ · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Операторы · 3/)).toBeInTheDocument()
  })

  it('marks the active chip', () => {
    render(<StaffFilterChips counts={counts} value="moderator" onChange={() => {}} />)
    const active = screen.getByText(/Модераторы · 4/).closest('button')
    expect(active).toHaveAttribute('data-active', 'true')
  })

  it('calls onChange with role key on click', () => {
    const onChange = vi.fn()
    render(<StaffFilterChips counts={counts} value="all" onChange={onChange} />)
    fireEvent.click(screen.getByText(/Операторы · 3/))
    expect(onChange).toHaveBeenCalledWith('operator')
  })
})
```

- [ ] **Step 2: Create dir + run test (fail)**

```bash
mkdir -p /Users/artemsaskin/Work/operator-dashboard/src/components/staff
npm run test:run -- src/components/staff/StaffFilterChips
```
Expected: FAIL.

- [ ] **Step 3: Implementation**

```jsx
// src/components/staff/StaffFilterChips.jsx
const ROLES = [
  { key: 'all',       label: 'Все' },
  { key: 'admin',     label: 'Админы' },
  { key: 'moderator', label: 'Модераторы' },
  { key: 'teamlead',  label: 'ТЛ' },
  { key: 'operator',  label: 'Операторы' },
]

export function StaffFilterChips({ counts, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map(({ key, label }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            data-active={active}
            onClick={() => onChange(key)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')}
          >
            {label} · {counts[key] ?? 0}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Tests pass**

Run: `npm run test:run -- src/components/staff/StaffFilterChips`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/StaffFilterChips.jsx src/components/staff/StaffFilterChips.test.jsx
git commit -m "feat(staff): add StaffFilterChips with tests"
```

---

## Task 11: `useStaffList` hook

**Files:**
- Create: `src/hooks/useStaffList.js`

- [ ] **Step 1: Create the hook**

```javascript
// src/hooks/useStaffList.js
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useStaffList(callerId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .rpc('list_staff', { p_caller_id: callerId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setRows([])
        } else {
          setRows(data ?? [])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [callerId, reloadKey])

  const counts = useMemo(() => {
    const c = { all: rows.length, admin: 0, moderator: 0, teamlead: 0, operator: 0, superadmin: 0 }
    for (const r of rows) c[r.role] = (c[r.role] ?? 0) + 1
    return c
  }, [rows])

  return { rows, counts, loading, error, reload: () => setReloadKey((k) => k + 1) }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useStaffList.js
git commit -m "feat(staff): add useStaffList hook"
```

---

## Task 12: `StaffTable` (desktop) and `StaffCardList` (mobile)

**Files:**
- Create: `src/components/staff/StaffTable.jsx`
- Create: `src/components/staff/StaffCardList.jsx`

- [ ] **Step 1: `StaffTable.jsx`**

```jsx
// src/components/staff/StaffTable.jsx
import { Link } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const roleLabel = {
  superadmin: 'Супер-Админ',
  admin: 'Админ',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

function Avatar({ firstName, lastName, muted }) {
  const initials =
    (firstName?.[0] ?? '').toUpperCase() + (lastName?.[0] ?? '').toUpperCase()
  return (
    <div
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
        muted
          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
      ].join(' ')}
    >
      {initials || '?'}
    </div>
  )
}

function formatAttributes(attrs) {
  if (!attrs || Object.keys(attrs).length === 0) return '—'
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
}

export function StaffTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <th className="px-4 py-3">Сотрудник</th>
            <th className="px-4 py-3">Реф-код</th>
            <th className="px-4 py-3">Роль</th>
            <th className="px-4 py-3">Атрибуты</th>
            <th className="px-4 py-3">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr
              key={u.id}
              className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            >
              <td className="px-4 py-3">
                <Link
                  to={`/staff/${encodeURIComponent(u.ref_code)}`}
                  className="flex items-center gap-3 text-slate-800 hover:underline dark:text-slate-200"
                >
                  <Avatar firstName={u.first_name} lastName={u.last_name} muted={!u.is_active} />
                  <span className={!u.is_active ? 'text-slate-400' : ''}>
                    {u.first_name} {u.last_name}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                {u.ref_code}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge[u.role] ?? ''}`}
                >
                  {roleLabel[u.role] ?? u.role}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                {formatAttributes(u.attributes)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      u.is_active ? 'bg-emerald-500' : 'bg-slate-400',
                    ].join(' ')}
                  />
                  {u.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                Сотрудников нет
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: `StaffCardList.jsx`**

```jsx
// src/components/staff/StaffCardList.jsx
import { Link } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const shortRole = {
  superadmin: 'СА', admin: 'Адм', moderator: 'Мод', teamlead: 'ТЛ', operator: 'ОП',
}

export function StaffCardList({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">Сотрудников нет</div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
      {rows.map((u) => {
        const initials = (u.first_name?.[0] ?? '').toUpperCase() + (u.last_name?.[0] ?? '').toUpperCase()
        return (
          <li key={u.id}>
            <Link
              to={`/staff/${encodeURIComponent(u.ref_code)}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {initials || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={['truncate text-sm font-medium', u.is_active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'].join(' ')}>
                    {u.first_name} {u.last_name}
                  </span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadge[u.role] ?? ''}`}>
                    {shortRole[u.role] ?? u.role}
                  </span>
                </div>
                <div className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  {u.ref_code}
                </div>
              </div>
              <span
                className={[
                  'h-2 w-2 shrink-0 rounded-full',
                  u.is_active ? 'bg-emerald-500' : 'bg-slate-400',
                ].join(' ')}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/staff/StaffTable.jsx src/components/staff/StaffCardList.jsx
git commit -m "feat(staff): add StaffTable (desktop) and StaffCardList (mobile)"
```

---

## Task 13: `StaffListPage`

**Files:**
- Modify: `src/pages/StaffListPage.jsx` (replace placeholder)

- [ ] **Step 1: Implementation**

```jsx
// src/pages/StaffListPage.jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useStaffList } from '../hooks/useStaffList.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { StaffFilterChips } from '../components/staff/StaffFilterChips.jsx'
import { StaffTable } from '../components/staff/StaffTable.jsx'
import { StaffCardList } from '../components/staff/StaffCardList.jsx'
import { hasPermission } from '../lib/permissions.js'

export function StaffListPage() {
  const { user, logout } = useAuth()
  const { rows, counts, loading, error } = useStaffList(user?.id)
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (!q) return true
      return (
        (u.first_name ?? '').toLowerCase().includes(q) ||
        (u.last_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.ref_code ?? '').toLowerCase().includes(q) ||
        (u.alias ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, role, search])

  const canCreate = hasPermission(user, 'create_users')

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Сотрудники
            </h1>
            <div className="flex-1" />
            {canCreate && (
              <Link
                to="/staff/new"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                + Добавить
              </Link>
            )}
          </header>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              placeholder="Поиск по имени, email, реф-коду…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
            />
            <StaffFilterChips counts={counts} value={role} onChange={setRole} />
          </div>

          {loading && (
            <p className="text-sm text-slate-500">Загрузка…</p>
          )}
          {error && (
            <p className="text-sm text-red-500">Ошибка: {error}</p>
          )}

          {!loading && !error && (
            <>
              <div className="hidden md:block">
                <StaffTable rows={filtered} />
              </div>
              <div className="md:hidden">
                <StaffCardList rows={filtered} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Build and dev smoke**

```bash
npm run build
npm run dev
```
Login, navigate to `/staff`. Expected: list of users loads. Filter chips change visible rows. Search works. Mobile viewport shows cards. Stop server.

- [ ] **Step 3: Run tests**

```bash
npm run test:run
```
Expected: all previous tests still green.

- [ ] **Step 4: Commit**

```bash
git add src/pages/StaffListPage.jsx
git commit -m "feat(staff): implement StaffListPage with filter, search, responsive table"
```

---

## Task 14: `RefCodePreview` component (TDD)

**Files:**
- Create: `src/components/staff/RefCodePreview.jsx`
- Create: `src/components/staff/RefCodePreview.test.jsx`

- [ ] **Step 1: Failing test**

```jsx
// src/components/staff/RefCodePreview.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RefCodePreview } from './RefCodePreview.jsx'

describe('<RefCodePreview>', () => {
  it('shows placeholder when fields empty', () => {
    render(<RefCodePreview role="moderator" firstName="" lastName="" />)
    expect(screen.getByText(/MOD-…-###/)).toBeInTheDocument()
  })

  it('builds code from inputs', () => {
    render(<RefCodePreview role="moderator" firstName="Иван" lastName="Петров" />)
    expect(screen.getByText(/MOD-ИванП-###/)).toBeInTheDocument()
  })

  it('capitalizes lowercase input', () => {
    render(<RefCodePreview role="teamlead" firstName="анна" lastName="михайлова" />)
    expect(screen.getByText(/TL-АннаМ-###/)).toBeInTheDocument()
  })

  it('shows nothing for unknown role', () => {
    const { container } = render(<RefCodePreview role="foo" firstName="A" lastName="B" />)
    expect(container.textContent).toContain('—')
  })
})
```

- [ ] **Step 2: Run test (fail)**

Run: `npm run test:run -- src/components/staff/RefCodePreview`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```jsx
// src/components/staff/RefCodePreview.jsx
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

- [ ] **Step 4: Tests pass**

Run: `npm run test:run -- src/components/staff/RefCodePreview`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/RefCodePreview.jsx src/components/staff/RefCodePreview.test.jsx
git commit -m "feat(staff): add RefCodePreview with tests"
```

---

## Task 15: `StaffCreatePage`

**Files:**
- Modify: `src/pages/StaffCreatePage.jsx` (replace placeholder)

- [ ] **Step 1: Implementation**

```jsx
// src/pages/StaffCreatePage.jsx
import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../useAuth.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { RefCodePreview } from '../components/staff/RefCodePreview.jsx'
import { defaultPermissions } from '../lib/defaultPermissions.js'
import { permissionGroups } from '../lib/permissionGroups.js'

const ROLES = [
  { value: 'admin',     label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'teamlead',  label: 'Тим Лидер' },
  { value: 'operator',  label: 'Оператор' },
]

export function StaffCreatePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState('moderator')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => new Set(defaultPermissions('moderator')))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // When role changes, re-seed permissions from defaults
  const setRoleAndPerms = (r) => {
    setRole(r)
    setPerms(new Set(defaultPermissions(r)))
  }

  const togglePerm = (key) => {
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const canSubmit = useMemo(() => {
    return (
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.length >= 6
    )
  }, [firstName, lastName, email, password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('create_staff', {
      p_caller_id: user.id,
      p_email: email.trim(),
      p_password: password,
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_permissions: Array.from(perms),
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    // data is the new user id (integer). Fetch ref_code to navigate.
    const { data: detail, error: detailErr } = await supabase.rpc('get_staff_detail', {
      p_caller_id: user.id,
      p_user_id: data,
    })
    if (detailErr || !detail?.[0]) {
      setError(detailErr?.message ?? 'Создано, но не удалось открыть карточку')
      setSubmitting(false)
      return
    }
    navigate(`/staff/${encodeURIComponent(detail[0].ref_code)}`)
  }

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <nav className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/staff" className="hover:underline">Сотрудники</Link>
            <span className="mx-2">›</span>
            Новый
          </nav>

          <h1 className="mb-6 text-2xl font-bold text-slate-800 dark:text-slate-100">
            Создать сотрудника
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Имя *</span>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Фамилия *</span>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Псевдоним</span>
                <input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Роль *</span>
                <select
                  value={role}
                  onChange={(e) => setRoleAndPerms(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email *</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Пароль * (мин. 6 символов)</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Реф-код (предпросмотр)</div>
              <RefCodePreview role={role} firstName={firstName} lastName={lastName} />
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Права (по умолчанию для роли, можно менять)
              </div>
              <div className="space-y-3">
                {permissionGroups.map((g) => (
                  <div key={g.title}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={perms.has(p.key)}
                            onChange={() => togglePerm(p.key)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-slate-700 dark:text-slate-300">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <Link
                to="/staff"
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Отмена
              </Link>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Создаётся…' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Build + dev smoke**

Run: `npm run build && npm run dev`. Navigate to `/staff/new`. Fill name/email/password. Ref-code preview updates live. Submit. Expected: redirect to `/staff/:refCode`. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/StaffCreatePage.jsx
git commit -m "feat(staff): implement StaffCreatePage with ref-code preview and default permissions"
```

---

## Task 16: `useStaff` hook + `StaffPageShell`

**Files:**
- Create: `src/hooks/useStaff.js`
- Create: `src/components/staff/StaffPageShell.jsx`

- [ ] **Step 1: `useStaff` hook**

```javascript
// src/hooks/useStaff.js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useStaff(callerId, refCode) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId || !refCode) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('list_staff', { p_caller_id: callerId })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setRow(null)
        } else {
          const match = (data ?? []).find((r) => r.ref_code === refCode)
          if (!match) {
            setError('Сотрудник не найден')
            setRow(null)
          } else {
            setRow(match)
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [callerId, refCode, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { row, loading, error, reload }
}
```

- [ ] **Step 2: `StaffPageShell.jsx`**

```jsx
// src/components/staff/StaffPageShell.jsx
import { Link, NavLink, useParams } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const roleLabel = {
  superadmin: 'Супер-Админ', admin: 'Администратор', moderator: 'Модератор',
  teamlead: 'Тим Лидер', operator: 'Оператор',
}

const tabBase = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors'
const tabIdle = 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
const tabActive = 'border-indigo-600 text-slate-800 dark:text-slate-100'

export function StaffPageShell({ row, headerActions, children }) {
  const initials =
    (row.first_name?.[0] ?? '').toUpperCase() + (row.last_name?.[0] ?? '').toUpperCase()

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/staff" className="hover:underline">Сотрудники</Link>
        <span className="mx-2">›</span>
        <span className="text-slate-700 dark:text-slate-300">{row.first_name} {row.last_name}</span>
      </nav>

      <div className="mb-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
          {initials || '?'}
          {/* Avatar upload placeholder (no-op) */}
          <button
            type="button"
            title="Загрузить аватар (в разработке)"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs text-white dark:border-slate-800"
            onClick={(e) => e.preventDefault()}
          >
            +
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {row.first_name} {row.last_name}
            </h1>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge[row.role] ?? ''}`}>
              {roleLabel[row.role] ?? row.role}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              <span className={['h-2 w-2 rounded-full', row.is_active ? 'bg-emerald-500' : 'bg-slate-400'].join(' ')} />
              {row.is_active ? 'Активен' : 'Неактивен'}
            </span>
            {row.has_pending_deletion && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                Запрос на удаление
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono dark:bg-slate-900">{row.ref_code}</span>
            <span>{row.email}</span>
            <span>Создан {new Date(row.created_at).toLocaleDateString('ru-RU')}</span>
          </div>
        </div>

        {headerActions && <div className="flex flex-shrink-0 gap-2">{headerActions}</div>}
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabLink refCode={row.ref_code} tab="" label="Профиль" />
        <TabLink refCode={row.ref_code} tab="attributes" label="Атрибуты" />
        <TabLink refCode={row.ref_code} tab="permissions" label="Права" />
        <TabLink refCode={row.ref_code} tab="activity" label="Активность" />
      </div>

      <div>{children}</div>
    </div>
  )
}

function TabLink({ refCode, tab, label }) {
  return (
    <NavLink
      to={tab ? `/staff/${encodeURIComponent(refCode)}/${tab}` : `/staff/${encodeURIComponent(refCode)}`}
      end
      className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabIdle}`}
    >
      {label}
    </NavLink>
  )
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useStaff.js src/components/staff/StaffPageShell.jsx
git commit -m "feat(staff): add useStaff hook and StaffPageShell"
```

---

## Task 17: `ProfileTab`, `AttributesTab`, `ActivityTab`

**Files:**
- Create: `src/components/staff/ProfileTab.jsx`
- Create: `src/components/staff/AttributesTab.jsx`
- Create: `src/components/staff/ActivityTab.jsx`

- [ ] **Step 1: `ProfileTab.jsx`**

```jsx
// src/components/staff/ProfileTab.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'

export function ProfileTab({ row, onSaved }) {
  const { user } = useAuth()
  const canEdit = user.id === row.id || hasPermission(user, 'create_users')

  const [firstName, setFirstName] = useState(row.first_name ?? '')
  const [lastName, setLastName] = useState(row.last_name ?? '')
  const [alias, setAlias] = useState(row.alias ?? '')
  const [email, setEmail] = useState(row.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setFirstName(row.first_name ?? '')
    setLastName(row.last_name ?? '')
    setAlias(row.alias ?? '')
    setEmail(row.email ?? '')
  }, [row])

  const save = async (e) => {
    e.preventDefault()
    if (!canEdit) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('update_staff_profile', {
      p_caller_id: user.id,
      p_user_id: row.id,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_email: email.trim(),
    })
    setSaving(false)
    if (err) setError(err.message)
    else onSaved?.()
  }

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2">
      <Field label="Имя" value={firstName} onChange={setFirstName} disabled={!canEdit} required />
      <Field label="Фамилия" value={lastName} onChange={setLastName} disabled={!canEdit} required />
      <Field label="Псевдоним" value={alias} onChange={setAlias} disabled={!canEdit} />
      <Field label="Email" value={email} onChange={setEmail} type="email" disabled={!canEdit} required />
      <ReadOnly label="Реф-код 🔒" value={row.ref_code} mono />
      <ReadOnly label="Роль 🔒" value={row.role} />
      {error && <p className="text-sm text-red-500 sm:col-span-2">{error}</p>}
      {canEdit && (
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      )}
    </form>
  )
}

function Field({ label, value, onChange, type = 'text', disabled, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}{required && ' *'}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
      />
    </label>
  )
}

function ReadOnly({ label, value, mono }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300 ${mono ? 'font-mono' : ''}`}>
        {value ?? '—'}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `AttributesTab.jsx`**

```jsx
// src/components/staff/AttributesTab.jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'

const SHIFTS = ['ДЕНЬ', 'ВЕЧЕР', 'НОЧЬ']

export function AttributesTab({ row, onSaved }) {
  const { user } = useAuth()
  const canEdit = user.id === row.id || hasPermission(user, 'create_users')
  const attrs = row.attributes ?? {}
  const [shift, setShift] = useState(attrs.shift ?? '')
  const [panelId, setPanelId] = useState(attrs.panel_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const applyAttribute = async (key, value) => {
    if (!canEdit) return
    setSaving(true)
    setError(null)
    let err
    if (value === '' || value == null) {
      ;({ error: err } = await supabase.rpc('delete_user_attribute', {
        p_caller_id: user.id, p_user_id: row.id, p_key: key,
      }))
    } else {
      ;({ error: err } = await supabase.rpc('set_user_attribute', {
        p_caller_id: user.id, p_user_id: row.id, p_key: key, p_value: String(value),
      }))
    }
    setSaving(false)
    if (err) setError(err.message)
    else onSaved?.()
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(row.role === 'moderator' || row.role === 'operator') && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Смена</span>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              onBlur={() => applyAttribute('shift', shift)}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">— не задана —</option>
              {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        {row.role === 'moderator' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Admin panel ID</span>
            <input
              value={panelId}
              onChange={(e) => setPanelId(e.target.value)}
              onBlur={() => applyAttribute('panel_id', panelId)}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="например: 2509"
            />
          </label>
        )}

        {row.role === 'operator' && row.tableau_id && (
          <div className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-400">
            Tableau ID: <span className="font-mono">{row.tableau_id}</span>
          </div>
        )}
      </div>

      {saving && <p className="mt-3 text-xs text-slate-500">Сохранение…</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Команды и назначения — в следующем подплане. Изменения сохраняются при потере фокуса.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: `ActivityTab.jsx`**

```jsx
// src/components/staff/ActivityTab.jsx
export function ActivityTab() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Здесь появится история действий сотрудника.
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">В разработке</p>
    </div>
  )
}
```

- [ ] **Step 4: Build check**

Run: `npm run build`. Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/ProfileTab.jsx src/components/staff/AttributesTab.jsx src/components/staff/ActivityTab.jsx
git commit -m "feat(staff): add Profile, Attributes, Activity tabs"
```

---

## Task 18: `PermissionsTab` (TDD)

**Files:**
- Create: `src/components/staff/PermissionsTab.jsx`
- Create: `src/components/staff/PermissionsTab.test.jsx`

- [ ] **Step 1: Failing test**

```jsx
// src/components/staff/PermissionsTab.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionsTab } from './PermissionsTab.jsx'

function withRow(overrides = {}) {
  return {
    id: 42,
    role: 'admin',
    permissions: ['create_tasks'],
    ...overrides,
  }
}

describe('<PermissionsTab>', () => {
  it('shows checkboxes for every known permission', () => {
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={false}
        onToggle={() => {}}
      />,
    )
    // Sample known permissions (must match permissionGroups.js labels)
    expect(screen.getByLabelText('Создавать задачи')).toBeChecked()
    expect(screen.getByLabelText('Создавать сотрудников')).not.toBeChecked()
  })

  it('calls onToggle with key and next value', () => {
    const onToggle = vi.fn()
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={true}
        onToggle={onToggle}
      />,
    )
    const cb = screen.getByLabelText('Создавать сотрудников')
    fireEvent.click(cb)
    expect(onToggle).toHaveBeenCalledWith('create_users', true)
  })

  it('disables checkboxes when canEdit is false', () => {
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByLabelText('Создавать задачи')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test (fail)**

Run: `npm run test:run -- src/components/staff/PermissionsTab`
Expected: FAIL.

- [ ] **Step 3: Implementation**

```jsx
// src/components/staff/PermissionsTab.jsx
import { permissionGroups } from '../../lib/permissionGroups.js'

export function PermissionsTab({ row, canEdit, onToggle }) {
  const active = new Set(row.permissions ?? [])
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      {permissionGroups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {g.permissions.map((p) => {
              const checked = active.has(p.key)
              return (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    onChange={(e) => onToggle(p.key, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <span className={canEdit ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}>
                    {p.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {!canEdit && (
        <p className="text-xs text-slate-400">Редактирование прав требует права <code>manage_roles</code>.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Tests pass**

Run: `npm run test:run -- src/components/staff/PermissionsTab`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/staff/PermissionsTab.jsx src/components/staff/PermissionsTab.test.jsx
git commit -m "feat(staff): add PermissionsTab with tests"
```

---

## Task 19: `ChangePasswordModal` and `DeleteRequestModal`

**Files:**
- Create: `src/components/staff/ChangePasswordModal.jsx`
- Create: `src/components/staff/DeleteRequestModal.jsx`
- Create: `src/components/staff/DeleteRequestModal.test.jsx`

- [ ] **Step 1: `ChangePasswordModal.jsx`**

```jsx
// src/components/staff/ChangePasswordModal.jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'

export function ChangePasswordModal({ userId, onClose, onDone }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Пароль минимум 6 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('change_staff_password', {
      p_caller_id: user.id, p_user_id: userId, p_new_password: password,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone?.()
    onClose()
  }

  return (
    <ModalShell title="Сменить пароль" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Новый пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Повторите</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Отмена
          </button>
          <button type="submit" disabled={submitting} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? 'Сохранение…' : 'Сменить'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

export function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `DeleteRequestModal.test.jsx`**

```jsx
// src/components/staff/DeleteRequestModal.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteRequestModal } from './DeleteRequestModal.jsx'

describe('<DeleteRequestModal>', () => {
  it('disables submit until reason is 20+ chars', () => {
    render(
      <DeleteRequestModal
        targetUserId={5}
        targetName="Иван Петров"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    )
    const submit = screen.getByRole('button', { name: /Отправить/i })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Причина/i), { target: { value: 'short' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Причина/i), {
      target: { value: 'Достаточно длинная причина для отправки' },
    })
    expect(submit).not.toBeDisabled()
  })

  it('calls onSubmit with reason when submitted', () => {
    const onSubmit = vi.fn()
    render(
      <DeleteRequestModal
        targetUserId={5}
        targetName="Иван Петров"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Причина/i), {
      target: { value: 'Сотрудник уволен, доступ больше не нужен' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }))
    expect(onSubmit).toHaveBeenCalledWith('Сотрудник уволен, доступ больше не нужен')
  })
})
```

- [ ] **Step 3: Run test (fail)**

Run: `npm run test:run -- src/components/staff/DeleteRequestModal`
Expected: FAIL.

- [ ] **Step 4: `DeleteRequestModal.jsx`**

```jsx
// src/components/staff/DeleteRequestModal.jsx
import { useState } from 'react'
import { ModalShell } from './ChangePasswordModal.jsx'

export function DeleteRequestModal({ targetUserId, targetName, onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length >= 20 && !submitting
  return (
    <ModalShell title={`Запросить удаление: ${targetName}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Запрос уйдёт на подтверждение Супер-Админу. До подтверждения сотрудник остаётся активным.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Причина (минимум 20 символов)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <span className="mt-1 text-xs text-slate-400">{reason.trim().length} / 20</span>
        </label>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onSubmit(reason.trim())}
            disabled={!canSubmit}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Отправить
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
```

- [ ] **Step 5: Tests pass**

Run: `npm run test:run -- src/components/staff/DeleteRequestModal`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/components/staff/ChangePasswordModal.jsx src/components/staff/DeleteRequestModal.jsx src/components/staff/DeleteRequestModal.test.jsx
git commit -m "feat(staff): add password change and delete request modals"
```

---

## Task 20: `StaffDetailPage` — wire everything together

**Files:**
- Modify: `src/pages/StaffDetailPage.jsx` (replace placeholder)

- [ ] **Step 1: Implementation**

```jsx
// src/pages/StaffDetailPage.jsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../useAuth.jsx'
import { useStaff } from '../hooks/useStaff.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { StaffPageShell } from '../components/staff/StaffPageShell.jsx'
import { ProfileTab } from '../components/staff/ProfileTab.jsx'
import { AttributesTab } from '../components/staff/AttributesTab.jsx'
import { PermissionsTab } from '../components/staff/PermissionsTab.jsx'
import { ActivityTab } from '../components/staff/ActivityTab.jsx'
import { ChangePasswordModal } from '../components/staff/ChangePasswordModal.jsx'
import { DeleteRequestModal } from '../components/staff/DeleteRequestModal.jsx'
import { hasPermission, isSuperadmin } from '../lib/permissions.js'

export function StaffDetailPage() {
  const { user, logout } = useAuth()
  const { refCode, tab } = useParams()
  const { row, loading, error, reload } = useStaff(user?.id, refCode)
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [delError, setDelError] = useState(null)

  const onToggle = async (key, next) => {
    if (!row) return
    const rpcName = next ? 'grant_permission' : 'revoke_permission'
    const { error: err } = await supabase.rpc(rpcName, {
      p_caller_id: user.id, p_target_user: row.id, p_permission: key,
    })
    if (err) { alert(err.message); return }
    reload()
  }

  const submitDeletion = async (reason) => {
    setDelSubmitting(true)
    setDelError(null)
    const { error: err } = await supabase.rpc('request_deletion', {
      p_caller_id: user.id, p_target_user: row.id, p_reason: reason,
    })
    setDelSubmitting(false)
    if (err) { setDelError(err.message); return }
    setDelOpen(false)
    reload()
  }

  const doDeactivate = async () => {
    if (!confirm('Деактивировать сотрудника?')) return
    const { error: err } = await supabase.rpc('deactivate_staff', {
      p_caller_id: user.id, p_user_id: row.id,
    })
    if (err) { alert(err.message); return }
    reload()
  }

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 p-4 sm:p-6">
        {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {error && <p className="text-sm text-red-500">Ошибка: {error}</p>}
        {row && (
          <StaffPageShell
            row={row}
            headerActions={
              <>
                <button
                  onClick={() => setPwOpen(true)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Сменить пароль
                </button>
                {isSuperadmin(user) ? (
                  <button
                    onClick={doDeactivate}
                    disabled={!row.is_active}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                  >
                    Деактивировать
                  </button>
                ) : (
                  hasPermission(user, 'create_users') && (
                    <button
                      onClick={() => setDelOpen(true)}
                      disabled={row.has_pending_deletion}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                    >
                      {row.has_pending_deletion ? 'Запрос отправлен' : 'Запросить удаление'}
                    </button>
                  )
                )}
              </>
            }
          >
            {tab === undefined && <ProfileTab row={row} onSaved={reload} />}
            {tab === 'attributes' && <AttributesTab row={row} onSaved={reload} />}
            {tab === 'permissions' && (
              <PermissionsTab
                row={row}
                canEdit={hasPermission(user, 'manage_roles')}
                onToggle={onToggle}
              />
            )}
            {tab === 'activity' && <ActivityTab />}
          </StaffPageShell>
        )}

        {pwOpen && row && (
          <ChangePasswordModal
            userId={row.id}
            onClose={() => setPwOpen(false)}
            onDone={() => reload()}
          />
        )}
        {delOpen && row && (
          <DeleteRequestModal
            targetUserId={row.id}
            targetName={`${row.first_name} ${row.last_name}`}
            submitting={delSubmitting}
            onClose={() => setDelOpen(false)}
            onSubmit={submitDeletion}
          />
        )}
        {delError && <p className="fixed bottom-4 right-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">{delError}</p>}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Smoke test**

Run `npm run build && npm run dev`. Login, open `/staff`, click a user. All 4 tabs render. Edit profile — saves. Toggle a permission — saves. Stop.

- [ ] **Step 3: Commit**

```bash
git add src/pages/StaffDetailPage.jsx
git commit -m "feat(staff): implement StaffDetailPage with tabs and modals"
```

---

## Task 21: `ApprovalReviewModal`, `useDeletionRequests`, `usePendingDeletionCount`, `NotificationsPage`

**Files:**
- Create: `src/components/staff/ApprovalReviewModal.jsx`
- Create: `src/hooks/useDeletionRequests.js`
- Modify: `src/hooks/usePendingDeletionCount.js` (replace stub)
- Modify: `src/pages/NotificationsPage.jsx` (replace placeholder)

- [ ] **Step 1: `useDeletionRequests.js`**

```javascript
// src/hooks/useDeletionRequests.js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useDeletionRequests(callerId, status = 'pending') {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!callerId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .rpc('list_deletion_requests', { p_caller_id: callerId, p_status: status })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setRows([]) }
        else setRows(data ?? [])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [callerId, status, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { rows, loading, error, reload }
}
```

- [ ] **Step 2: `usePendingDeletionCount.js` (replace stub)**

```javascript
// src/hooks/usePendingDeletionCount.js
import { useEffect, useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { supabase } from '../supabaseClient'

export function usePendingDeletionCount({ enabled = true } = {}) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled || !user?.id) return
    let cancelled = false
    const fetch = () => {
      supabase
        .rpc('count_pending_deletions', { p_caller_id: user.id })
        .then(({ data, error }) => {
          if (cancelled || error) return
          setCount(data ?? 0)
        })
    }
    fetch()
    const t = setInterval(fetch, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [enabled, user?.id])

  return count
}
```

- [ ] **Step 3: `ApprovalReviewModal.jsx`**

```jsx
// src/components/staff/ApprovalReviewModal.jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { ModalShell } from './ChangePasswordModal.jsx'

export function ApprovalReviewModal({ request, onClose, onDone }) {
  const { user } = useAuth()
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const call = async (rpc) => {
    setSubmitting(true); setError(null)
    const { error: err } = await supabase.rpc(rpc, {
      p_caller_id: user.id, p_request_id: request.id, p_note: note || null,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone?.()
    onClose()
  }

  return (
    <ModalShell title={`Запрос на удаление: ${request.target_full_name}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <dl className="space-y-1 rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <div><dt className="inline text-slate-500">Кто запросил:</dt> <dd className="inline font-medium">{request.requested_by_full_name} ({request.requested_by_ref_code})</dd></div>
          <div><dt className="inline text-slate-500">Когда:</dt> <dd className="inline">{new Date(request.created_at).toLocaleString('ru-RU')}</dd></div>
          <div><dt className="inline text-slate-500">Кого:</dt> <dd className="inline font-medium">{request.target_full_name} — {request.target_email} ({request.target_ref_code})</dd></div>
        </dl>
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">Причина:</div>
          <div className="rounded-md border-l-2 border-slate-300 bg-slate-50 p-3 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {request.reason}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Комментарий (опционально)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3">
          <button onClick={() => call('reject_deletion')} disabled={submitting} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Отклонить
          </button>
          <button onClick={() => call('approve_deletion')} disabled={submitting} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            Подтвердить и деактивировать
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
```

- [ ] **Step 4: `NotificationsPage.jsx`**

```jsx
// src/pages/NotificationsPage.jsx
import { useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { isSuperadmin } from '../lib/permissions.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { useDeletionRequests } from '../hooks/useDeletionRequests.js'
import { ApprovalReviewModal } from '../components/staff/ApprovalReviewModal.jsx'

export function NotificationsPage() {
  const { user, logout } = useAuth()
  const { rows, loading, error, reload } = useDeletionRequests(user?.id, 'pending')
  const [reviewing, setReviewing] = useState(null)

  if (!isSuperadmin(user)) {
    return (
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
        <Sidebar user={user} onLogout={logout} />
        <main className="flex-1 p-6 text-sm text-slate-500">Недоступно</main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-2xl font-bold text-slate-800 dark:text-slate-100">
            Оповещения
          </h1>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Запросы на удаление ({rows.length})
          </h2>

          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {error && <p className="text-sm text-red-500">Ошибка: {error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="rounded-md border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Нет запросов на рассмотрение
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {r.target_full_name}
                    <span className="ml-2 font-mono text-xs text-slate-400">{r.target_ref_code}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    от {r.requested_by_full_name} · {new Date(r.created_at).toLocaleString('ru-RU')}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                    {r.reason}
                  </div>
                </div>
                <button
                  onClick={() => setReviewing(r)}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Рассмотреть
                </button>
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
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Build + smoke**

```bash
npm run build
npm run dev
```
Login as superadmin. Create a pending deletion (as admin via UI). Go to `/notifications` — request visible. Approve it. Target deactivated. Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/components/staff/ApprovalReviewModal.jsx src/hooks/useDeletionRequests.js src/hooks/usePendingDeletionCount.js src/pages/NotificationsPage.jsx
git commit -m "feat(notifications): list deletion requests with approve/reject flow"
```

---

## Task 22: Delete legacy files

**Files:**
- Delete: `src/AdminPanel.jsx`, `src/AdminLayout.jsx`, `src/sections/*`, `api/admin/*`

- [ ] **Step 1: Verify no references remain**

Run:
```bash
cd /Users/artemsaskin/Work/operator-dashboard
grep -rn "AdminPanel\|AdminLayout\|sections/" src/ --include="*.jsx" --include="*.js"
grep -rn "api/admin" src/ --include="*.jsx" --include="*.js"
```
Expected: no matches (or only inside the files being deleted). If any App.jsx imports remain — fix them first.

- [ ] **Step 2: Delete**

```bash
git rm src/AdminPanel.jsx src/AdminLayout.jsx
git rm -r src/sections/
git rm -r api/admin/
```

- [ ] **Step 3: Build + full tests**

```bash
npm run build
npm run test:run
```
Expected: build succeeds, all tests green.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove legacy AdminPanel, AdminLayout, sections/, api/admin/*"
```

---

## Task 23: Final check + NOTES.md update

**Files:**
- Modify: `NOTES.md`

- [ ] **Step 1: Full suite**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
npm run test:run
npm run lint
npm run build
```
Fix anything introduced by Subplan 2. Pre-existing lint issues unrelated to our changes — report but don't block.

- [ ] **Step 2: Manual smoke-test checklist on preview URL**

After push, test each item on the Vercel preview:
1. Login as superadmin → sidebar shows Сотрудники + Оповещения
2. `/staff` loads, filter chips work, search works
3. Mobile viewport (375px) — table becomes cards
4. `/staff/new` — create moderator with name "Test User" → appears in list with `MOD-TestU-NNN` code + has 3 default permissions
5. Click new user → 4 tabs render
6. Profile tab: edit "Test" → "Тест", save — name updates in hero
7. Attributes tab: select "ДЕНЬ" shift — saves on blur
8. Permissions tab: toggle `create_tasks` — reload page, state preserved
9. Change password modal — new password works on re-login
10. As admin role: "Запросить удаление" → write 25-char reason → submit
11. As superadmin: `/notifications` shows pending → approve → target deactivated; badge decrements
12. Switch light↔dark theme — all new screens render correctly

- [ ] **Step 3: Append to NOTES.md**

```markdown

---

## CRM Subplan 2 — Staff Management — готово 2026-04-24

### Новый UI
- `/staff` — список сотрудников с фильтрами и поиском (desktop table / mobile cards)
- `/staff/new` — форма создания с живым preview реф-кода + default permissions
- `/staff/:refCode[/tab]` — страница сотрудника с 4 табами (Профиль / Атрибуты / Права / Активность)
- `/notifications` — очередь запросов на удаление (только для Супер-Админа)
- Sidebar с навигацией и бейджем pending-запросов

### Backend (миграции 09–11)
- Таблица `deletion_requests`, колонки `phone/telegram/notes` в `dashboard_users`
- RPC: `create_staff`, `update_staff_profile`, `list_staff`, `get_staff_detail`, `change_staff_password`, `request_deletion`, `approve_deletion`, `reject_deletion`, `list_deletion_requests`, `count_pending_deletions`, `deactivate_staff`, `_next_ref_code` (helper)

### Удалено
- `src/AdminPanel.jsx`, `src/AdminLayout.jsx`, `src/sections/*`
- `api/admin/*` (5 файлов) — фронт перешёл на прямые `supabase.rpc`
- Старая колонка `dashboard_users.permissions` (jsonb) пока остаётся как backup — кандидат на удаление в следующем подплане

### Темы
Все новые компоненты работают в светлой и тёмной теме через Tailwind токены. Переключатель темы — существующий в `DashboardPage`.

### Тесты
Vitest: `defaultPermissions`, `permissionGroups`, `StaffFilterChips`, `RefCodePreview`, `PermissionsTab`, `DeleteRequestModal` + сохранившиеся от Subplan 1.

```

- [ ] **Step 4: Commit**

```bash
git add NOTES.md
git commit -m "docs: note CRM Subplan 2 completion in NOTES.md"
```

- [ ] **Step 5: Final branch status**

```bash
git log --oneline crm-foundation ^main | head -40
ls db/migrations/
```
Expected: 11 SQL files in migrations, Subplan 2 commits added on top of Subplan 1.

---

## Exit criteria
- All 12 manual smoke-test items in Task 23 pass
- `npm run test:run` — all tests green
- `npm run build` — succeeds
- Branch ready for PR or merge
- `/api/admin/*` removed, AdminPanel completely replaced
- No regressions in existing Dashboard revenue view
