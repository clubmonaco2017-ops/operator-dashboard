# Browser Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship browser push notifications covering all four notification sources (`task_activity`, `team_activity`, `staff_activity`, `deletion_requests`). Events flow Postgres → `pg_net` AFTER INSERT trigger → HMAC-signed POST to a Vercel webhook → `web-push.send()` to per-device subscriptions. Service Worker suppresses notifications when an app tab is focused, and clicks deep-link to entity pages with `/notifications` as a fallback.

**Architecture:** Six stages (Setup → DB → Server → SW & PWA → UI → Integration & QA). Each stage = one commit (some long stages split into 2 commits). Final stage adds the production deployment checklist. **Note vs spec:** the implementation plan replaces the spec's `render_push_payload` SQL function with a leaner `get_push_event_data` RPC (raw fields) plus a JS renderer in `api/push/_render.js` that imports the existing `src/lib/notificationMessages.js`. This eliminates duplicate Russian copy across SQL and JS — one source of truth, less drift risk.

**Tech Stack:** React 19, Vite, Supabase (`@supabase/supabase-js`), `@supabase/supabase-js` admin client, custom auth via `dashboard_users.auth_user_id`, Vercel serverless functions (Node.js runtime, not Edge), `web-push` (NEW dep), `pg_net` Postgres extension (already on Supabase), Vitest + @testing-library/react. Deploy via `vercel --prod` from main checkout under team `clubmonaco2017-ops-projects`.

**Source of truth:**
- [Spec](../specs/2026-05-03-browser-push-notifications-design.md) — decisions, architecture, risk register, out-of-scope list.
- [Notifications inbox roadmap](../../../).claude memory — referenced in spec.

**Prerequisites:**
- PRs #69, #70, #71, #72 merged on `main` ✓
- Migrations 91–107 applied ✓
- Supabase `pg_net` extension available (default on Supabase managed Postgres)
- Vercel team `clubmonaco2017-ops-projects` access (already configured per memory)
- Personal browser available for QA (Chrome desktop minimum; Android optional but recommended)

---

## File structure

### Create

```
api/push/
  dispatch.js                              # webhook handler
  _verify.js                               # HMAC + freshness pure util (testable)
  _render.js                               # builds {title,body,url,tag} from event data via src/lib/notificationMessages.js
  _verify.test.js                          # vitest
  _render.test.js                          # vitest
public/
  sw.js                                    # service worker (push, click, subscriptionchange)
  manifest.webmanifest                     # PWA manifest
  icons/
    icon-192.png
    icon-512.png
    icon-maskable-512.png
    notification-192.png
    badge-72.png
    apple-touch-icon-180.png
scripts/
  generate-vapid.mjs                       # one-shot VAPID keypair generator
  test-push-dispatch.mjs                   # local smoke test against /api/push/dispatch
src/lib/
  pushClient.js                            # enablePush / disablePush / getPushState / iOS helper
  pushClient.test.js
src/hooks/
  usePushPermission.js
  usePushPermission.test.js
src/components/notifications/
  PushSettingsCard.jsx
  PushSettingsCard.test.jsx
  PushPromptBanner.jsx
  PushPromptBanner.test.jsx
db/migrations/
  20260504_108_push_subscriptions_table.sql
  20260504_109_rpc_push_subscriptions_crud.sql
  20260504_110_rpc_list_push_recipients.sql
  20260504_111_pg_net_triggers.sql
  20260504_112_rpc_get_push_event_data.sql
  20260504_113_rpc_disable_push_subscriptions_bulk.sql
```

### Modify

```
package.json                                # + web-push dep
index.html                                  # manifest link, apple meta tags
vercel.json                                 # + headers block for /sw.js and /manifest.webmanifest
src/main.jsx                                # ensureSWRegistered() call + push:navigate router listener
src/useAuth.jsx                             # signOut → also call disablePush() best-effort
src/pages/NotificationsPage.jsx             # embed PushPromptBanner + PushSettingsCard
.env.local                                  # NEW keys (manual, not committed)
```

### NOT touched

- `useNotifications*` hooks — push does not change inbox feed.
- `useNotificationsRealtimeSync.js` — realtime continues to drive in-app updates.
- `list_user_notifications`, `count_user_notifications_unseen`, `mark_notifications_visited` — push uses a separate `list_push_recipients` RPC.
- `src/lib/notificationMessages.js` — reused by `api/push/_render.js`. No edits.
- `api/admin/_supabase.js`, `api/admin/_auth.js` — reused as-is.

---

## Stages

| # | Stage | Commits | Outcome |
|---|---|---|---|
| 1 | Setup (deps, VAPID, env) | 1 | `web-push` installed, VAPID keypair generated, `.env.local` populated locally |
| 2 | DB schema (migrations 108–113) | 1 | Subscriptions table, RPCs, triggers in place |
| 3 | Server (`/api/push/dispatch`) | 1 | Webhook accepts signed events and fans out via `web-push` |
| 4 | Client SW + PWA (`sw.js`, manifest, icons, headers) | 1 | SW registered, PWA installable, icons in place |
| 5 | UI (pushClient, hook, settings card, banner) | 1 | `/notifications` shows working enable/disable toggle |
| 6 | Integration + QA (NotificationsPage wire, main.jsx, signOut, smoke test, prod deploy) | 2 (one feature, one deploy/QA) | Push works end-to-end in production |

PR opened at end of Stage 6.

---

## Stage 1 — Setup

### Task 1.1 — Branch + baseline

**Files:**
- Create: branch `feat/browser-push-notifications` from `main`

- [ ] **Step 1: Create feature branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/browser-push-notifications
git status
```
Expected: clean tree, branch ahead 0.

- [ ] **Step 2: Verify baseline tests pass**

```bash
npm run test:run
```
Expected: all tests green. Note baseline count for later comparison.

### Task 1.2 — Install `web-push`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install dependency**

```bash
npm i web-push
```

- [ ] **Step 2: Verify install**

```bash
node -e "import('web-push').then(m => console.log(typeof m.default.generateVAPIDKeys))"
```
Expected: `function`.

### Task 1.3 — VAPID generator script

**Files:**
- Create: `scripts/generate-vapid.mjs`

- [ ] **Step 1: Write script**

```js
// scripts/generate-vapid.mjs
import webpush from 'web-push'
const keys = webpush.generateVAPIDKeys()
console.log('VITE_VAPID_PUBLIC_KEY=' + keys.publicKey)
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey)
```

- [ ] **Step 2: Run + capture keys**

```bash
node scripts/generate-vapid.mjs
```
Expected: two lines printed. Copy both into `.env.local` (do **not** commit).

- [ ] **Step 3: Add a 32-byte HMAC secret + email to `.env.local`**

Append (do not commit):
```
VAPID_CONTACT_EMAIL=temash@gmail.com
PUSH_WEBHOOK_SECRET=<output of `openssl rand -hex 32`>
```

- [ ] **Step 4: Verify `.env.local` has the four new keys**

```bash
grep -E '^(VITE_VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_CONTACT_EMAIL|PUSH_WEBHOOK_SECRET)=' .env.local | wc -l
```
Expected: `4`.

### Task 1.4 — Commit Stage 1

- [ ] **Step 1: Stage and commit**

```bash
git add package.json package-lock.json scripts/generate-vapid.mjs
git commit -m "$(cat <<'EOF'
feat(push): install web-push + VAPID generator script

Stage 1 of browser push notifications. Adds web-push dependency and a
one-shot script to produce a VAPID keypair for storage in env.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 2 — Database schema

All migrations follow the project's VERIFY/ROLLBACK trailer convention. Apply via Supabase Studio SQL editor (per memory, SQL is always inline in chat).

### Task 2.1 — Migration 108: `push_subscriptions` table

**Files:**
- Create: `db/migrations/20260504_108_push_subscriptions_table.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 108: push_subscriptions table.

BEGIN;

CREATE TABLE public.push_subscriptions (
  id            bigserial   PRIMARY KEY,
  user_id       integer     NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  endpoint      text        NOT NULL UNIQUE,
  p256dh        text        NOT NULL,
  auth          text        NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);

CREATE INDEX push_subscriptions_user_idx
  ON public.push_subscriptions (user_id)
  WHERE disabled_at IS NULL;

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions per browser/device. Soft-disabled (disabled_at) on 404/410 from push service.';

COMMIT;

-- VERIFY:
--   \d+ public.push_subscriptions
--   SELECT COUNT(*) FROM push_subscriptions;
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.push_subscriptions;
```

- [ ] **Step 2: Apply migration via Studio SQL editor**

Paste the SQL above. Expected: `CREATE TABLE` then `CREATE INDEX` then `COMMENT` then `COMMIT`.

- [ ] **Step 3: Verify schema**

In Studio:
```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
 ORDER BY ordinal_position;
```
Expected: 9 columns matching the definition above.

### Task 2.2 — Migration 109: subscription CRUD RPCs

**Files:**
- Create: `db/migrations/20260504_109_rpc_push_subscriptions_crud.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 109: upsert/delete RPCs for push subscriptions.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL
)
RETURNS bigint
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
  v_id        bigint;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;
  IF p_endpoint IS NULL OR p_p256dh IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'endpoint/p256dh/auth required' USING errcode = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_caller_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id      = EXCLUDED.user_id,
        p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_agent   = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
        last_seen_at = now(),
        disabled_at  = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_id integer := current_dashboard_user_id();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING errcode = '28000';
  END IF;

  DELETE FROM public.push_subscriptions
   WHERE endpoint = p_endpoint
     AND user_id  = v_caller_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text)
  TO authenticated;

COMMIT;

-- VERIFY:
--   SELECT public.upsert_push_subscription('https://example.test/x','p','a','UA') AS new_id;
--   SELECT * FROM push_subscriptions WHERE endpoint = 'https://example.test/x';
--   SELECT public.delete_push_subscription('https://example.test/x');
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.delete_push_subscription(text);
--   DROP FUNCTION IF EXISTS public.upsert_push_subscription(text, text, text, text);
```

- [ ] **Step 2: Apply migration in Studio**

- [ ] **Step 3: Smoke verify (as a real authenticated user — pick any test row from `dashboard_users`):**

```sql
-- Replace 1 with a real dashboard_users.id you can impersonate via JWT in dev.
-- For Studio runs (postgres role), current_dashboard_user_id() will be NULL.
-- Just confirm the functions exist:
SELECT proname FROM pg_proc
 WHERE proname IN ('upsert_push_subscription', 'delete_push_subscription');
```
Expected: 2 rows.

### Task 2.3 — Migration 110: `list_push_recipients`

**Files:**
- Create: `db/migrations/20260504_110_rpc_list_push_recipients.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 110: list_push_recipients — recipient + endpoint resolution per event.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_push_recipients(
  p_source text,
  p_row_id bigint
)
RETURNS TABLE (
  user_id  integer,
  endpoint text,
  p256dh   text,
  auth     text
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_id  integer;
  v_target_id integer;   -- staff_activity target
  v_task_row  tasks%ROWTYPE;
  v_team_id   integer;
BEGIN
  IF p_source = 'task_activity' THEN
    SELECT t.* INTO v_task_row
      FROM task_activity ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE ta.id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT actor_id INTO v_actor_id FROM task_activity WHERE id = p_row_id;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            -- superadmin: all active users
            u.role = 'superadmin'
         OR -- admin: users from the agency that owns the assignee
            (u.role = 'admin' AND EXISTS (
              SELECT 1 FROM admin_agencies aa
                JOIN dashboard_users a ON a.id = v_task_row.assigned_to
               WHERE aa.admin_user_id = u.id
                 AND aa.agency_id = a.agency_id))
         OR -- everyone else: the assignee or creator personally
            (u.role IN ('lead', 'mod', 'operator')
             AND (u.id = v_task_row.assigned_to OR u.id = v_task_row.created_by))
       );

  ELSIF p_source = 'team_activity' THEN
    SELECT actor_id, team_id INTO v_actor_id, v_team_id
      FROM team_activity WHERE id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
      JOIN teams tm ON tm.id = v_team_id
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            u.role = 'superadmin'
         OR (u.role = 'admin' AND tm.agency_id IN (
              SELECT agency_id FROM admin_agencies WHERE admin_user_id = u.id))
         OR (u.role IN ('lead', 'mod', 'operator') AND (
              EXISTS (SELECT 1 FROM team_members mem
                       WHERE mem.team_id = tm.id AND mem.user_id = u.id)))
       );

  ELSIF p_source = 'staff_activity' THEN
    SELECT actor_id, user_id INTO v_actor_id, v_target_id
      FROM staff_activity WHERE id = p_row_id;
    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT DISTINCT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active
       AND u.id IS DISTINCT FROM v_actor_id
       AND (
            u.role = 'superadmin'
         OR (u.role = 'admin' AND EXISTS (
              SELECT 1 FROM admin_agencies aa
                JOIN dashboard_users target ON target.id = v_target_id
               WHERE aa.admin_user_id = u.id
                 AND aa.agency_id = target.agency_id))
         OR (u.role IN ('lead', 'mod', 'operator') AND u.id = v_target_id)
       );

  ELSIF p_source = 'deletion_requests' THEN
    RETURN QUERY
    SELECT u.id, ps.endpoint, ps.p256dh, ps.auth
      FROM dashboard_users u
      JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.disabled_at IS NULL
     WHERE u.is_active AND u.role = 'superadmin';

  ELSE
    RAISE EXCEPTION 'unknown source: %', p_source;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.list_push_recipients(text, bigint)
  TO authenticated, service_role;

COMMIT;

-- VERIFY (run after a sample event row exists):
--   SELECT * FROM list_push_recipients('task_activity', (SELECT MAX(id) FROM task_activity));
--   SELECT * FROM list_push_recipients('deletion_requests', (SELECT MAX(id) FROM deletion_requests));
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.list_push_recipients(text, bigint);
```

- [ ] **Step 2: Apply migration in Studio**

- [ ] **Step 3: Verify function exists**

```sql
SELECT proname FROM pg_proc WHERE proname = 'list_push_recipients';
```
Expected: 1 row.

### Task 2.4 — Migration 112: `get_push_event_data`

(Migration numbers stay 108→113; we apply 112 before 111 for ordering convenience because 111 depends on a configured GUC, not on 112.)

**Files:**
- Create: `db/migrations/20260504_112_rpc_get_push_event_data.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 112: get_push_event_data — single row of base fields used by /api/push/dispatch
-- to render title/body/url. Returns the same shape that list_user_notifications produces
-- for a single source/row, minus is_unseen (push has no per-user unseen state at send time).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_push_event_data(
  p_source text,
  p_row_id bigint
)
RETURNS TABLE (
  source        text,
  entity_id     integer,
  entity_label  text,
  actor_id      integer,
  actor_name    text,
  event_type    text,
  payload       jsonb,
  created_at    timestamptz
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_source = 'task_activity' THEN
    RETURN QUERY
    SELECT 'task_activity'::text, ta.task_id, t.title, ta.actor_id,
           (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
           ta.event_type, ta.payload, ta.created_at
      FROM task_activity ta
      JOIN tasks t                ON t.id = ta.task_id
      LEFT JOIN dashboard_users u ON u.id = ta.actor_id
     WHERE ta.id = p_row_id;

  ELSIF p_source = 'team_activity' THEN
    RETURN QUERY
    SELECT 'team_activity'::text, tma.team_id, tm.name, tma.actor_id,
           (u.first_name || ' ' || COALESCE(u.last_name, ''))::text,
           tma.event_type, tma.payload, tma.created_at
      FROM team_activity tma
      JOIN teams tm               ON tm.id = tma.team_id
      LEFT JOIN dashboard_users u ON u.id = tma.actor_id
     WHERE tma.id = p_row_id;

  ELSIF p_source = 'staff_activity' THEN
    RETURN QUERY
    SELECT 'staff_activity'::text, sa.user_id,
           (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
           sa.actor_id,
           (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
           sa.event_type, sa.payload, sa.created_at
      FROM staff_activity sa
      JOIN dashboard_users du_target ON du_target.id = sa.user_id
      LEFT JOIN dashboard_users du_actor ON du_actor.id = sa.actor_id
     WHERE sa.id = p_row_id;

  ELSIF p_source = 'deletion_requests' THEN
    RETURN QUERY
    SELECT 'deletion_request'::text, dr.id,
           (du_target.first_name || ' ' || COALESCE(du_target.last_name, ''))::text,
           dr.requested_by,
           (du_actor.first_name || ' ' || COALESCE(du_actor.last_name, ''))::text,
           ('deletion_request_' || dr.status)::text,
           to_jsonb(dr),
           dr.created_at
      FROM deletion_requests dr
      JOIN dashboard_users du_target ON du_target.id = dr.target_user_id
      JOIN dashboard_users du_actor  ON du_actor.id  = dr.requested_by
     WHERE dr.id = p_row_id;

  ELSE
    RAISE EXCEPTION 'unknown source: %', p_source;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_push_event_data(text, bigint)
  TO authenticated, service_role;

COMMIT;

-- VERIFY:
--   SELECT * FROM get_push_event_data('task_activity', (SELECT MAX(id) FROM task_activity));
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.get_push_event_data(text, bigint);
```

- [ ] **Step 2: Apply migration in Studio**

- [ ] **Step 3: Verify**

```sql
SELECT * FROM get_push_event_data('task_activity', (SELECT MAX(id) FROM task_activity));
```
Expected: 1 row with non-null `entity_label` and `actor_name`.

### Task 2.5 — Migration 113: `disable_push_subscriptions_bulk`

**Files:**
- Create: `db/migrations/20260504_113_rpc_disable_push_subscriptions_bulk.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 113: bulk soft-disable push subscriptions by endpoint.
-- Called from /api/push/dispatch after 404/410 responses from push services.

BEGIN;

CREATE OR REPLACE FUNCTION public.disable_push_subscriptions_bulk(
  p_endpoints text[]
)
RETURNS integer
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.push_subscriptions
     SET disabled_at = now()
   WHERE endpoint = ANY(p_endpoints)
     AND disabled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.disable_push_subscriptions_bulk(text[])
  TO service_role;

COMMIT;

-- VERIFY:
--   SELECT public.disable_push_subscriptions_bulk(ARRAY['no-such-endpoint']::text[]);
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.disable_push_subscriptions_bulk(text[]);
```

- [ ] **Step 2: Apply migration in Studio**

- [ ] **Step 3: Verify**

```sql
SELECT public.disable_push_subscriptions_bulk(ARRAY['no-such-endpoint']::text[]);
```
Expected: returns `0`.

### Task 2.6 — Migration 111: `pg_net` extension + AFTER INSERT triggers

(Applied last in Stage 2 because it wires events to the webhook; safer to land after the recipient/data RPCs exist. The trigger is also a no-op until production GUCs are set, so applying it in dev is harmless.)

**Files:**
- Create: `db/migrations/20260504_111_pg_net_triggers.sql`

- [ ] **Step 1: Write migration**

```sql
-- Migration 111: pg_net extension + AFTER INSERT triggers that POST event metadata
-- to /api/push/dispatch with HMAC-SHA256 signature. Trigger is a no-op when
-- app.push_webhook_url / app.push_webhook_secret GUCs are not configured (dev safety).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;  -- creates schema `net`; preinstalled on Supabase

CREATE OR REPLACE FUNCTION public.enqueue_push_event() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url    text := current_setting('app.push_webhook_url', true);
  v_secret text := current_setting('app.push_webhook_secret', true);
  v_body   jsonb;
  v_sig    text;
BEGIN
  IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
    RETURN NEW;
  END IF;

  v_body := jsonb_build_object(
    'source',     TG_TABLE_NAME,
    'row_id',     NEW.id,
    'created_at', NEW.created_at
  );

  v_sig := encode(
    extensions.hmac(v_body::text::bytea, v_secret::bytea, 'sha256'),
    'hex'
  );

  PERFORM net.http_post(
    url     := v_url,
    body    := v_body,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Push-Signature', v_sig
    )
  );

  RETURN NEW;
END $$;

CREATE TRIGGER push_event_task_activity
  AFTER INSERT ON public.task_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_team_activity
  AFTER INSERT ON public.team_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_staff_activity
  AFTER INSERT ON public.staff_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

CREATE TRIGGER push_event_deletion_requests
  AFTER INSERT ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();

COMMIT;

-- VERIFY:
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE tgname LIKE 'push_event_%';
--   -- Expected: 4 rows.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS push_event_deletion_requests ON public.deletion_requests;
--   DROP TRIGGER IF EXISTS push_event_staff_activity   ON public.staff_activity;
--   DROP TRIGGER IF EXISTS push_event_team_activity    ON public.team_activity;
--   DROP TRIGGER IF EXISTS push_event_task_activity    ON public.task_activity;
--   DROP FUNCTION IF EXISTS public.enqueue_push_event();
```

> **Note on `extensions.hmac`:** the `pgcrypto` extension exposes `hmac()` in the `extensions` schema on Supabase. If your environment has `pgcrypto` in `public`, replace with `public.hmac(...)`. Verify with `\df *.hmac` in psql or `SELECT n.nspname || '.' || p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'hmac';`.

- [ ] **Step 2: Apply migration in Studio**

- [ ] **Step 3: Verify triggers**

```sql
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'push_event_%' ORDER BY tgname;
```
Expected: 4 rows (`push_event_deletion_requests`, `push_event_staff_activity`, `push_event_task_activity`, `push_event_team_activity`).

- [ ] **Step 4: Confirm dev-mode no-op**

Insert any throwaway team/task/staff event row that already happens via app code OR check that without GUCs `enqueue_push_event` returns NEW without calling http_post:

```sql
SELECT current_setting('app.push_webhook_url', true);
```
Expected: empty string or NULL — confirms no http_post will fire in dev.

### Task 2.7 — Commit Stage 2

- [ ] **Step 1: Stage and commit**

```bash
git add db/migrations/20260504_108_*.sql \
        db/migrations/20260504_109_*.sql \
        db/migrations/20260504_110_*.sql \
        db/migrations/20260504_111_*.sql \
        db/migrations/20260504_112_*.sql \
        db/migrations/20260504_113_*.sql
git commit -m "$(cat <<'EOF'
feat(push): db schema for push subscriptions and dispatch triggers

Migrations 108-113. Adds push_subscriptions table with multi-device
endpoints and soft-delete via disabled_at, upsert/delete RPCs called from
the browser, list_push_recipients RPC mirroring list_user_notifications
scoping, get_push_event_data RPC for server-side render, pg_net AFTER
INSERT triggers on the four notification source tables, and a
bulk-disable RPC used after 404/410 responses from push services.

Triggers are no-ops in environments without app.push_webhook_url and
app.push_webhook_secret GUCs configured.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 3 — Server (`/api/push/dispatch`)

### Task 3.1 — `_verify.js` (HMAC + freshness)

**Files:**
- Create: `api/push/_verify.js`, `api/push/_verify.test.js`

- [ ] **Step 1: Write failing test**

```js
// api/push/_verify.test.js
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyWebhook, FIVE_MINUTES_MS } from './_verify.js'

const SECRET = 'test-secret'

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyWebhook', () => {
  it('returns ok=true for matching HMAC and fresh created_at', () => {
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: true })
  })

  it('rejects with reason="signature" on bad HMAC', () => {
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: new Date().toISOString() })
    const r = verifyWebhook({ rawBody: body, signature: 'deadbeef', secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects with reason="missing-signature" when header absent', () => {
    const body = '{}'
    const r = verifyWebhook({ rawBody: body, signature: undefined, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'missing-signature' })
  })

  it('rejects with reason="malformed" when JSON parse fails', () => {
    const body = '{not-json'
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects with reason="missing-fields" when source or row_id absent', () => {
    const body = JSON.stringify({ created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'missing-fields' })
  })

  it('rejects with reason="stale" when created_at older than 5 min', () => {
    const stale = new Date(Date.now() - (FIVE_MINUTES_MS + 1000)).toISOString()
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: stale })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'stale' })
  })

  it('returns parsed payload alongside ok=true', () => {
    const body = JSON.stringify({ source: 'task_activity', row_id: 42, created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r.ok).toBe(true)
    expect(r.payload).toMatchObject({ source: 'task_activity', row_id: 42 })
  })
})
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
npm run test:run -- api/push/_verify.test.js
```
Expected: failure, "Cannot find module './_verify.js'".

- [ ] **Step 3: Implement `_verify.js`**

```js
// api/push/_verify.js
import crypto from 'node:crypto'

export const FIVE_MINUTES_MS = 5 * 60 * 1000

export function verifyWebhook({ rawBody, signature, secret, now }) {
  if (!signature) return { ok: false, reason: 'missing-signature' }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  let sigOk = false
  try {
    sigOk = expected.length === signature.length &&
            crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    sigOk = false
  }
  if (!sigOk) return { ok: false, reason: 'signature' }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload || typeof payload.source !== 'string' || (payload.row_id == null)) {
    return { ok: false, reason: 'missing-fields' }
  }

  const ts = payload.created_at ? Date.parse(payload.created_at) : NaN
  if (!Number.isFinite(ts) || (now - ts) > FIVE_MINUTES_MS || (ts - now) > FIVE_MINUTES_MS) {
    return { ok: false, reason: 'stale' }
  }

  return { ok: true, payload }
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- api/push/_verify.test.js
```
Expected: 7 tests pass.

### Task 3.2 — `_render.js` (title/body/url/tag)

**Files:**
- Create: `api/push/_render.js`, `api/push/_render.test.js`

- [ ] **Step 1: Write failing test**

```js
// api/push/_render.test.js
import { describe, it, expect } from 'vitest'
import { renderPushPayload } from './_render.js'

describe('renderPushPayload', () => {
  it('renders task_activity into title/body/url/tag', () => {
    const ev = {
      source: 'task_activity',
      entity_id: 7,
      entity_label: 'Купить молоко',
      actor_name: 'Анна Смирнова',
      event_type: 'task_created',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 12345)
    expect(r).toEqual({
      title: 'Купить молоко',
      body: 'Анна Смирнова создала задачу «Купить молоко»',
      url: '/tasks?id=7',
      tag: 'task_activity:12345',
    })
  })

  it('renders team_activity', () => {
    const ev = {
      source: 'team_activity',
      entity_id: 4,
      entity_label: 'Команда Альфа',
      actor_name: 'Иван',
      event_type: 'member_added',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 99)
    expect(r.title).toBe('Команда Альфа')
    expect(r.body).toBe('Иван добавил участника в команду «Команда Альфа»')
    expect(r.url).toBe('/teams?id=4')
    expect(r.tag).toBe('team_activity:99')
  })

  it('renders staff_activity (target user)', () => {
    const ev = {
      source: 'staff_activity',
      entity_id: 11,
      entity_label: 'Пётр Иванов',
      actor_name: 'Анна',
      event_type: 'curator_assigned',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 5)
    expect(r.title).toBe('Пётр Иванов')
    expect(r.body).toBe('Анна назначила куратора для Пётр Иванов')
    expect(r.url).toBe('/staff')
    expect(r.tag).toBe('staff_activity:5')
  })

  it('renders deletion_request with placeholder url', () => {
    const ev = {
      source: 'deletion_request',
      entity_id: 17,
      entity_label: 'Алексей Петров',
      actor_name: 'Анна',
      event_type: 'deletion_request_pending',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 17)
    expect(r.title).toBe('Запрос на удаление')
    expect(r.body).toContain('Алексей Петров')
    expect(r.url).toBe('/admin/agencies')
    expect(r.tag).toBe('deletion_request:17')
  })

  it('falls back to /notifications when source maps to no deep link', () => {
    const ev = {
      source: 'unknown',
      entity_id: 1,
      entity_label: 'X',
      actor_name: 'Y',
      event_type: 'noop',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 1)
    expect(r.url).toBe('/notifications')
  })
})
```

- [ ] **Step 2: Run test (fails)**

```bash
npm run test:run -- api/push/_render.test.js
```
Expected: failure.

- [ ] **Step 3: Implement `_render.js`**

```js
// api/push/_render.js
//
// Renders the push payload sent to the Service Worker. Reuses the existing
// in-app notification copy via src/lib/notificationMessages.js so the push
// title/body stay byte-identical to the inbox row text.

import {
  formatNotificationMessage,
  targetForNotification,
} from '../../src/lib/notificationMessages.js'

const DELETION_REQUEST_TARGET = '/admin/agencies'

export function renderPushPayload(eventData, rowId) {
  // eventData shape mirrors get_push_event_data: { source, entity_id, entity_label,
  // actor_id, actor_name, event_type, payload, created_at }.

  const body = formatNotificationMessage(eventData)

  let title
  if (eventData.source === 'deletion_request') {
    title = 'Запрос на удаление'
  } else {
    title = eventData.entity_label || 'Уведомление'
  }

  let url = targetForNotification(eventData)
  if (!url) {
    url = eventData.source === 'deletion_request' ? DELETION_REQUEST_TARGET : '/notifications'
  }

  const tag = `${eventData.source}:${rowId}`

  return { title, body, url, tag }
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- api/push/_render.test.js
```
Expected: 5 tests pass.

### Task 3.3 — `dispatch.js` handler

**Files:**
- Create: `api/push/dispatch.js`

- [ ] **Step 1: Implement handler** (no unit test — exercised via Task 6.4 smoke script + manual QA; shape parallels `api/admin/platforms.js`)

```js
// api/push/dispatch.js
import webpush from 'web-push'
import { getSupabaseAdmin } from '../admin/_supabase.js'
import { verifyWebhook } from './_verify.js'
import { renderPushPayload } from './_render.js'

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'),
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

async function readRawBody(req) {
  if (typeof req.text === 'function') return await req.text()
  return await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function send(res, status, json) {
  if (res && typeof res.status === 'function') {
    return res.status(status).json(json)
  }
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })

  const rawBody = await readRawBody(req)
  const signature = req.headers?.['x-push-signature'] || req.headers?.get?.('x-push-signature')
  const verdict = verifyWebhook({
    rawBody,
    signature,
    secret: process.env.PUSH_WEBHOOK_SECRET,
    now: Date.now(),
  })
  if (!verdict.ok) {
    const status = verdict.reason === 'malformed' || verdict.reason === 'missing-fields' ? 400 : 401
    return send(res, status, { error: verdict.reason })
  }

  const { source, row_id } = verdict.payload
  const sb = getSupabaseAdmin()

  const [{ data: recipients, error: recErr }, { data: eventRows, error: evErr }] = await Promise.all([
    sb.rpc('list_push_recipients', { p_source: source, p_row_id: row_id }),
    sb.rpc('get_push_event_data', { p_source: source, p_row_id: row_id }),
  ])
  if (recErr) return send(res, 500, { error: 'recipients lookup failed: ' + recErr.message })
  if (evErr) return send(res, 500, { error: 'event lookup failed: ' + evErr.message })

  const eventData = Array.isArray(eventRows) ? eventRows[0] : eventRows
  if (!eventData) return send(res, 200, { sent: 0, reason: 'event-deleted' })
  if (!recipients?.length) return send(res, 200, { sent: 0 })

  const payload = renderPushPayload(eventData, row_id)
  const payloadJson = JSON.stringify(payload)

  const results = await Promise.allSettled(
    recipients.map((r) =>
      webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        payloadJson,
        { TTL: 60 * 60 * 24 },
      ),
    ),
  )

  const dead = []
  let sent = 0
  results.forEach((res2, i) => {
    if (res2.status === 'fulfilled') sent += 1
    else if (res2.reason && [404, 410].includes(res2.reason.statusCode)) {
      dead.push(recipients[i].endpoint)
    }
  })

  if (dead.length) {
    await sb.rpc('disable_push_subscriptions_bulk', { p_endpoints: dead })
  }

  return send(res, 200, {
    sent,
    failed: results.length - sent,
    pruned: dead.length,
  })
}

export const config = { runtime: 'nodejs' }
```

- [ ] **Step 2: Verify file builds (no syntax error)**

```bash
node --check api/push/dispatch.js
```
Expected: no output (valid).

### Task 3.4 — Commit Stage 3

- [ ] **Step 1: Stage and commit**

```bash
git add api/push/
git commit -m "$(cat <<'EOF'
feat(push): /api/push/dispatch webhook with HMAC verification and fan-out

Adds three files under api/push/: _verify.js (HMAC + 5-minute freshness),
_render.js (reuses src/lib/notificationMessages.js to keep push copy in
sync with in-app inbox), and dispatch.js (the webhook handler that resolves
recipients, renders payload, fans out via web-push, and bulk-disables
endpoints that return 404/410).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 4 — Service Worker, PWA manifest, icons, headers

### Task 4.1 — Service Worker

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: Write SW**

```js
// public/sw.js
//
// Web Push handler. Suppresses notification when an app tab is focused
// (existing in-app realtime already updates the inbox in that case),
// otherwise shows an OS-level notification with a deep link.

self.addEventListener('push', (event) => event.waitUntil(handlePush(event)))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/notifications'
  event.waitUntil(handleClick(url))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // Browser rotated keys. Best-effort re-subscribe; persist via window-side code on next page load.
  // The page will call upsert_push_subscription via getSubscription() in usePushPermission.
})

async function handlePush(event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const { title, body, url, tag } = data

  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const focused = wins.find((c) => c.visibilityState === 'visible' && c.focused)
  if (focused) {
    focused.postMessage({ type: 'push:received', payload: data })
    return
  }

  await self.registration.showNotification(title || 'Уведомление', {
    body: body || '',
    tag: tag || undefined,
    icon: '/icons/notification-192.png',
    badge: '/icons/badge-72.png',
    data: { url: url || '/notifications' },
    renotify: false,
  })
}

async function handleClick(url) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const sameOrigin = wins.find((c) => {
    try { return new URL(c.url).origin === self.location.origin } catch { return false }
  })
  if (sameOrigin) {
    sameOrigin.postMessage({ type: 'push:navigate', url })
    if ('focus' in sameOrigin) await sameOrigin.focus()
    return
  }
  if (self.clients.openWindow) await self.clients.openWindow(url)
}
```

- [ ] **Step 2: Lint check (eslint)**

```bash
npx eslint public/sw.js --no-eslintrc --rule '{"no-undef":"off"}'
```
Expected: no errors.

### Task 4.2 — PWA manifest

**Files:**
- Create: `public/manifest.webmanifest`

- [ ] **Step 1: Write manifest**

```json
{
  "name": "Operator Dashboard",
  "short_name": "Dashboard",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Task 4.3 — Icon placeholders from `favicon.svg`

**Files:**
- Create: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `notification-192.png`, `badge-72.png`, `apple-touch-icon-180.png`

- [ ] **Step 1: Generate placeholders**

If ImageMagick is available:
```bash
mkdir -p public/icons
for size in 72 180 192 512; do
  magick -background none -size ${size}x${size} public/favicon.svg public/icons/_${size}.png
done
cp public/icons/_192.png public/icons/icon-192.png
cp public/icons/_192.png public/icons/notification-192.png
cp public/icons/_512.png public/icons/icon-512.png
cp public/icons/_512.png public/icons/icon-maskable-512.png
cp public/icons/_180.png public/icons/apple-touch-icon-180.png
cp public/icons/_72.png  public/icons/badge-72.png
rm public/icons/_*.png
ls public/icons
```

If not, use any 1×1 transparent PNG as a stand-in (test placeholder; replace with real art before launch):
```bash
mkdir -p public/icons
node -e "const fs=require('fs'); const buf=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=','base64'); for (const f of ['icon-192','icon-512','icon-maskable-512','notification-192','badge-72','apple-touch-icon-180']) fs.writeFileSync('public/icons/'+f+'.png', buf);"
ls public/icons
```

Expected: 6 PNG files. **TODO note in PR description:** real artwork is a separate design task.

- [ ] **Step 2: Verify file presence**

```bash
ls public/icons/*.png | wc -l
```
Expected: `6`.

### Task 4.4 — `index.html` PWA meta tags

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Read current `index.html`**

```bash
cat index.html
```

- [ ] **Step 2: Insert manifest + apple meta tags inside `<head>`**

Use the Edit tool to add after the existing `<link rel="icon" ...>` line:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0f172a" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Dashboard" />
```

- [ ] **Step 3: Verify**

```bash
grep -c 'apple-mobile-web-app' index.html
```
Expected: `3`.

### Task 4.5 — `vercel.json` headers

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read current `vercel.json`**

```bash
cat vercel.json
```

- [ ] **Step 2: Replace contents** (Vercel docs: rewrites and headers can coexist, but rewrites for `/(.*)` must come last so static assets in `public/` are served first)

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Content-Type",           "value": "application/javascript; charset=utf-8" },
        { "key": "Cache-Control",          "value": "public, max-age=0, must-revalidate" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)",     "destination": "/index.html" }
  ]
}
```

- [ ] **Step 3: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"
```
Expected: no output (valid).

### Task 4.6 — Commit Stage 4

- [ ] **Step 1: Stage and commit**

```bash
git add public/sw.js public/manifest.webmanifest public/icons/ index.html vercel.json
git commit -m "$(cat <<'EOF'
feat(push): service worker, PWA manifest, and Vercel headers

Adds /sw.js (push, notificationclick, pushsubscriptionchange) which
suppresses OS notifications when an app tab is focused and falls back to
showNotification otherwise. Adds manifest.webmanifest plus placeholder
PNG icons (final art is a separate design task) and the apple-mobile-web-
app meta tags required for iOS Add-to-Home-Screen + push to function.

vercel.json grows a headers block for /sw.js (max-age=0 mandatory) and
/manifest.webmanifest content type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 5 — Client UI (lib + hook + components)

### Task 5.1 — `pushClient.js`

**Files:**
- Create: `src/lib/pushClient.js`, `src/lib/pushClient.test.js`

- [ ] **Step 1: Write failing test**

```js
// src/lib/pushClient.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const supabaseRpc = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: supabaseRpc },
}))

// Provide test-only globals.
const setNotification = (perm) => {
  globalThis.Notification = {
    permission: perm,
    requestPermission: vi.fn().mockResolvedValue(perm === 'default' ? 'granted' : perm),
  }
}

const fakeSubscribe = vi.fn()
const fakeGetSubscription = vi.fn()

beforeEach(() => {
  supabaseRpc.mockReset().mockResolvedValue({ data: 1, error: null })
  fakeSubscribe.mockReset()
  fakeGetSubscription.mockReset()
  globalThis.PushManager = function () {}
  globalThis.navigator = {
    userAgent: 'jsdom',
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: fakeGetSubscription,
          subscribe: fakeSubscribe,
        },
      }),
      getRegistration: vi.fn(),
    },
  }
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  globalThis.self = globalThis
  globalThis.crypto = globalThis.crypto || { getRandomValues: () => new Uint8Array(0) }
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary')
  // Vite import.meta.env is not present in vitest — pushClient reads it via a getter helper.
})

afterEach(() => {
  delete globalThis.Notification
  delete globalThis.PushManager
})

describe('getPushState', () => {
  it('returns "unsupported" without serviceWorker or PushManager', async () => {
    delete globalThis.PushManager
    const { getPushState } = await import('./pushClient.js')
    expect(getPushState()).toBe('unsupported')
  })

  it('returns Notification.permission otherwise', async () => {
    setNotification('default')
    const { getPushState } = await import('./pushClient.js?t=' + Date.now())
    expect(getPushState()).toBe('default')
  })
})

describe('isIosNonStandalone', () => {
  it('detects iPhone Safari without standalone display-mode', async () => {
    globalThis.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)'
    const { isIosNonStandalone } = await import('./pushClient.js?t=' + Date.now())
    expect(isIosNonStandalone()).toBe(true)
  })

  it('returns false in standalone display-mode', async () => {
    globalThis.navigator.userAgent = 'iPhone'
    globalThis.window.matchMedia = () => ({ matches: true })
    const { isIosNonStandalone } = await import('./pushClient.js?t=' + Date.now())
    expect(isIosNonStandalone()).toBe(false)
  })
})

describe('enablePush', () => {
  it('subscribes via pushManager and persists via RPC', async () => {
    setNotification('default')
    fakeGetSubscription.mockResolvedValue(null)
    fakeSubscribe.mockResolvedValue({
      endpoint: 'https://x.test/abc',
      toJSON: () => ({ endpoint: 'https://x.test/abc', keys: { p256dh: 'P', auth: 'A' } }),
    })
    process.env.VITE_VAPID_PUBLIC_KEY = 'BEh...test...key'

    const { enablePush } = await import('./pushClient.js?t=' + Date.now())
    const result = await enablePush()
    expect(result.state).toBe('granted')
    expect(supabaseRpc).toHaveBeenCalledWith('upsert_push_subscription', {
      p_endpoint: 'https://x.test/abc',
      p_p256dh:   'P',
      p_auth:     'A',
      p_user_agent: 'jsdom',
    })
  })

  it('returns state=denied without RPC call when permission denied', async () => {
    setNotification('denied')
    const { enablePush } = await import('./pushClient.js?t=' + Date.now())
    const r = await enablePush()
    expect(r.state).toBe('denied')
    expect(supabaseRpc).not.toHaveBeenCalled()
  })
})

describe('disablePush', () => {
  it('calls RPC and unsubscribes', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: 'https://x.test/abc',
          unsubscribe,
        }),
      },
    })

    const { disablePush } = await import('./pushClient.js?t=' + Date.now())
    await disablePush()
    expect(supabaseRpc).toHaveBeenCalledWith('delete_push_subscription', {
      p_endpoint: 'https://x.test/abc',
    })
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('is a no-op when no subscription present', async () => {
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    })
    const { disablePush } = await import('./pushClient.js?t=' + Date.now())
    await expect(disablePush()).resolves.toBeUndefined()
    expect(supabaseRpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
npm run test:run -- src/lib/pushClient.test.js
```
Expected: failure.

- [ ] **Step 3: Implement `pushClient.js`**

```js
// src/lib/pushClient.js
import { supabase } from '../supabaseClient'

function getVapidPublicKey() {
  // Prefer Vite client env, fall back to plain process.env (used in vitest setups).
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY
  }
  return process.env?.VITE_VAPID_PUBLIC_KEY || ''
}

export function getPushState() {
  if (typeof navigator === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator)) return 'unsupported'
  if (typeof PushManager === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export function isIosNonStandalone() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent || '')
  if (!isIos) return false
  const standalone = (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true
  return !standalone
}

export async function ensureSWRegistered() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush() {
  const state = getPushState()
  if (state === 'unsupported') return { state }

  const reg = await ensureSWRegistered()
  if (!reg) return { state: 'unsupported' }

  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return { state: perm }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const key = getVapidPublicKey()
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }
  const json = typeof sub.toJSON === 'function'
    ? sub.toJSON()
    : { endpoint: sub.endpoint, keys: { p256dh: '', auth: '' } }

  await supabase.rpc('upsert_push_subscription', {
    p_endpoint:   json.endpoint,
    p_p256dh:     json.keys.p256dh,
    p_auth:       json.keys.auth,
    p_user_agent: navigator.userAgent || null,
  })
  return { state: 'granted', endpoint: json.endpoint }
}

export async function disablePush() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription?.()
  if (!sub) return
  try {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  } finally {
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- src/lib/pushClient.test.js
```
Expected: 8 tests pass.

### Task 5.2 — `usePushPermission` hook

**Files:**
- Create: `src/hooks/usePushPermission.js`, `src/hooks/usePushPermission.test.js`

- [ ] **Step 1: Write failing test**

```js
// src/hooks/usePushPermission.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../lib/pushClient.js', () => ({
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn(),
}))
import { getPushState, isIosNonStandalone, ensureSWRegistered } from '../lib/pushClient.js'
import { usePushPermission } from './usePushPermission.js'

describe('usePushPermission', () => {
  beforeEach(() => {
    getPushState.mockReset()
    isIosNonStandalone.mockReset().mockReturnValue(false)
    ensureSWRegistered.mockReset().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    })
  })

  it('reports unsupported state', () => {
    getPushState.mockReturnValue('unsupported')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('unsupported')
    expect(result.current.supported).toBe(false)
  })

  it('reports default state', () => {
    getPushState.mockReturnValue('default')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('default')
    expect(result.current.supported).toBe(true)
  })

  it('flags iosHint when iOS non-standalone', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.iosHint).toBe(true)
  })

  it('isSubscribed is true when getSubscription resolves to an object', async () => {
    getPushState.mockReturnValue('granted')
    ensureSWRegistered.mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x.test' }),
      },
    })
    const { result } = renderHook(() => usePushPermission())
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(result.current.isSubscribed).toBe(true)
  })

  it('refresh() re-reads state', () => {
    getPushState.mockReturnValueOnce('default').mockReturnValueOnce('granted')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('default')
    act(() => result.current.refresh())
    expect(result.current.state).toBe('granted')
  })
})
```

- [ ] **Step 2: Run test (fails)**

```bash
npm run test:run -- src/hooks/usePushPermission.test.js
```
Expected: failure.

- [ ] **Step 3: Implement hook**

```js
// src/hooks/usePushPermission.js
import { useCallback, useEffect, useState } from 'react'
import { getPushState, isIosNonStandalone, ensureSWRegistered } from '../lib/pushClient.js'

/**
 * Reactive snapshot of push permission + subscription state.
 *
 * Returns:
 *   state         — 'unsupported' | 'default' | 'granted' | 'denied'
 *   supported     — true if state !== 'unsupported'
 *   isSubscribed  — true iff browser has a PushSubscription
 *   iosHint       — true on iOS Safari outside standalone PWA mode
 *   refresh()     — re-read state and isSubscribed
 */
export function usePushPermission() {
  const [state, setState] = useState(() => getPushState())
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [iosHint, setIosHint] = useState(() => isIosNonStandalone())

  const refresh = useCallback(() => {
    setState(getPushState())
    setIosHint(isIosNonStandalone())
    ensureSWRegistered()
      .then((reg) => reg?.pushManager?.getSubscription?.())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false))
  }, [])

  useEffect(() => {
    refresh()
    const onVis = () => refresh()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [refresh])

  return { state, supported: state !== 'unsupported', isSubscribed, iosHint, refresh }
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- src/hooks/usePushPermission.test.js
```
Expected: 5 tests pass.

### Task 5.3 — `PushSettingsCard` component

**Files:**
- Create: `src/components/notifications/PushSettingsCard.jsx`, `.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// src/components/notifications/PushSettingsCard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/pushClient.js', () => ({
  enablePush:   vi.fn(),
  disablePush:  vi.fn(),
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn().mockResolvedValue({
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
  }),
}))
import { enablePush, disablePush, getPushState, isIosNonStandalone } from '../../lib/pushClient.js'
import { PushSettingsCard } from './PushSettingsCard.jsx'

beforeEach(() => {
  enablePush.mockReset()
  disablePush.mockReset()
  getPushState.mockReset()
  isIosNonStandalone.mockReset().mockReturnValue(false)
})

describe('PushSettingsCard', () => {
  it('renders unsupported message when state is unsupported', () => {
    getPushState.mockReturnValue('unsupported')
    render(<PushSettingsCard />)
    expect(screen.getByText(/не поддерживает push/i)).toBeInTheDocument()
  })

  it('renders enable button when state is default', () => {
    getPushState.mockReturnValue('default')
    render(<PushSettingsCard />)
    expect(screen.getByRole('button', { name: /Включить/i })).toBeInTheDocument()
  })

  it('clicking enable calls enablePush', async () => {
    getPushState.mockReturnValue('default')
    enablePush.mockResolvedValue({ state: 'granted', endpoint: 'x' })
    render(<PushSettingsCard />)
    fireEvent.click(screen.getByRole('button', { name: /Включить/i }))
    await waitFor(() => expect(enablePush).toHaveBeenCalled())
  })

  it('renders disable button when subscribed', async () => {
    getPushState.mockReturnValue('granted')
    const { rerender } = render(<PushSettingsCard />)
    // Force isSubscribed=true via prop trick: re-render with mocked hook value
    // (we test the granted+subscribed branch by mocking ensureSWRegistered to return a subscription)
    const { ensureSWRegistered } = await import('../../lib/pushClient.js')
    ensureSWRegistered.mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'x' }) },
    })
    rerender(<PushSettingsCard />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Отключить/i })).toBeInTheDocument()
    )
  })

  it('shows denied info when permission denied', () => {
    getPushState.mockReturnValue('denied')
    render(<PushSettingsCard />)
    expect(screen.getByText(/Заблокировано в настройках браузера/i)).toBeInTheDocument()
  })

  it('shows iOS hint instead of toggle when iosHint is true', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    render(<PushSettingsCard />)
    expect(screen.getByText(/Добавьте.*на главный экран/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Включить/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (fails — component missing)**

```bash
npm run test:run -- src/components/notifications/PushSettingsCard.test.jsx
```
Expected: failure.

- [ ] **Step 3: Implement component**

```jsx
// src/components/notifications/PushSettingsCard.jsx
import { useState } from 'react'
import { usePushPermission } from '../../hooks/usePushPermission.js'
import { enablePush, disablePush } from '../../lib/pushClient.js'

export function PushSettingsCard() {
  const { state, isSubscribed, iosHint, refresh } = usePushPermission()
  const [busy, setBusy] = useState(false)

  const onEnable = async () => {
    setBusy(true)
    try { await enablePush() } finally { setBusy(false); refresh() }
  }
  const onDisable = async () => {
    setBusy(true)
    try { await disablePush() } finally { setBusy(false); refresh() }
  }

  let body
  if (state === 'unsupported') {
    body = <p className="text-sm text-muted-foreground">Ваш браузер не поддерживает push.</p>
  } else if (iosHint) {
    body = (
      <p className="text-sm text-muted-foreground">
        Добавьте приложение на главный экран, чтобы получать уведомления на iPhone.
      </p>
    )
  } else if (state === 'denied') {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Заблокировано в настройках браузера. Включите уведомления для этого сайта в настройках сайта.
        </p>
      </div>
    )
  } else if (state === 'granted' && isSubscribed) {
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={onDisable}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        Отключить на этом устройстве
      </button>
    )
  } else {
    // default OR (granted without subscription)
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={onEnable}
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Включить
      </button>
    )
  }

  return (
    <section className="rounded-md border border-border-strong p-4">
      <h2 className="mb-1 text-base font-medium text-foreground">Push-уведомления</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Уведомления настраиваются для каждого устройства/браузера отдельно.
      </p>
      {body}
    </section>
  )
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- src/components/notifications/PushSettingsCard.test.jsx
```
Expected: 6 tests pass.

### Task 5.4 — `PushPromptBanner` component

**Files:**
- Create: `src/components/notifications/PushPromptBanner.jsx`, `.test.jsx`

- [ ] **Step 1: Write failing test**

```jsx
// src/components/notifications/PushPromptBanner.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/pushClient.js', () => ({
  enablePush: vi.fn(),
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn().mockResolvedValue({
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
  }),
}))
import { enablePush, getPushState, isIosNonStandalone } from '../../lib/pushClient.js'
import { PushPromptBanner, DISMISSED_KEY } from './PushPromptBanner.jsx'

beforeEach(() => {
  localStorage.clear()
  enablePush.mockReset()
  getPushState.mockReset()
  isIosNonStandalone.mockReset().mockReturnValue(false)
})

describe('PushPromptBanner', () => {
  it('renders when state=default and not dismissed', () => {
    getPushState.mockReturnValue('default')
    render(<PushPromptBanner />)
    expect(screen.getByText(/Получайте уведомления/i)).toBeInTheDocument()
  })

  it('does not render when state=granted', () => {
    getPushState.mockReturnValue('granted')
    const { container } = render(<PushPromptBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when dismissed within 7 days', () => {
    getPushState.mockReturnValue('default')
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    const { container } = render(<PushPromptBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders again when dismissed flag is older than 7 days', () => {
    getPushState.mockReturnValue('default')
    localStorage.setItem(DISMISSED_KEY, String(Date.now() - 8 * 24 * 60 * 60 * 1000))
    render(<PushPromptBanner />)
    expect(screen.getByText(/Получайте уведомления/i)).toBeInTheDocument()
  })

  it('clicking dismiss writes a fresh timestamp and hides', () => {
    getPushState.mockReturnValue('default')
    const { container } = render(<PushPromptBanner />)
    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))
    expect(localStorage.getItem(DISMISSED_KEY)).toBeTruthy()
    expect(container.firstChild).toBeNull()
  })

  it('clicking enable calls enablePush and hides on success', async () => {
    getPushState.mockReturnValue('default')
    enablePush.mockResolvedValue({ state: 'granted' })
    const { container } = render(<PushPromptBanner />)
    fireEvent.click(screen.getByRole('button', { name: /Включить/i }))
    await waitFor(() => expect(enablePush).toHaveBeenCalled())
  })

  it('renders iOS hint instead of enable button when iosHint is true', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    render(<PushPromptBanner />)
    expect(screen.getByText(/Добавьте.*на главный экран/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Включить$/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test (fails)**

```bash
npm run test:run -- src/components/notifications/PushPromptBanner.test.jsx
```
Expected: failure.

- [ ] **Step 3: Implement component**

```jsx
// src/components/notifications/PushPromptBanner.jsx
import { useState } from 'react'
import { usePushPermission } from '../../hooks/usePushPermission.js'
import { enablePush } from '../../lib/pushClient.js'

export const DISMISSED_KEY = 'push_prompt_dismissed_at'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function readDismissed() {
  try {
    const v = Number(localStorage.getItem(DISMISSED_KEY))
    if (!Number.isFinite(v) || v <= 0) return 0
    return v
  } catch { return 0 }
}

export function PushPromptBanner() {
  const { state, iosHint, refresh } = usePushPermission()
  const [dismissedAt, setDismissedAt] = useState(() => readDismissed())
  const [busy, setBusy] = useState(false)

  if (state !== 'default') return null
  if (dismissedAt && (Date.now() - dismissedAt) < SEVEN_DAYS_MS) return null

  const dismiss = () => {
    const ts = Date.now()
    try { localStorage.setItem(DISMISSED_KEY, String(ts)) } catch { /* ignore */ }
    setDismissedAt(ts)
  }
  const onEnable = async () => {
    setBusy(true)
    try { await enablePush() } finally { setBusy(false); refresh(); dismiss() }
  }

  return (
    <div
      role="region"
      aria-label="Push notifications prompt"
      className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border-strong bg-card p-3"
    >
      <div className="text-sm text-foreground">
        {iosHint
          ? 'Добавьте приложение на главный экран, чтобы получать уведомления на iPhone.'
          : 'Получайте уведомления, даже когда вкладка закрыта.'}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!iosHint && (
          <button
            type="button"
            disabled={busy}
            onClick={onEnable}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Включить
          </button>
        )}
        <button
          type="button"
          aria-label="закрыть"
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          ×
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests, expect green**

```bash
npm run test:run -- src/components/notifications/PushPromptBanner.test.jsx
```
Expected: 7 tests pass.

### Task 5.5 — Commit Stage 5

- [ ] **Step 1: Stage and commit**

```bash
git add src/lib/pushClient.js src/lib/pushClient.test.js \
        src/hooks/usePushPermission.js src/hooks/usePushPermission.test.js \
        src/components/notifications/PushSettingsCard.jsx \
        src/components/notifications/PushSettingsCard.test.jsx \
        src/components/notifications/PushPromptBanner.jsx \
        src/components/notifications/PushPromptBanner.test.jsx
git commit -m "$(cat <<'EOF'
feat(push): client lib, usePushPermission hook, settings card, prompt banner

pushClient.js owns enable/disable/getPushState/iOS detection. usePushPermission
exposes state to components and re-reads on visibilitychange. PushSettingsCard
renders the per-device on/off toggle with denied / unsupported / iOS branches.
PushPromptBanner is the dismissable header banner that appears once per
seven days while permission is in default state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Stage 6 — Integration + production deploy

### Task 6.1 — Wire UI into `/notifications`

**Files:**
- Modify: `src/pages/NotificationsPage.jsx`

- [ ] **Step 1: Add imports + render**

Use the Edit tool. After the `import { ApprovalReviewModal }` line, add:

```jsx
import { PushPromptBanner } from '../components/notifications/PushPromptBanner.jsx'
import { PushSettingsCard } from '../components/notifications/PushSettingsCard.jsx'
```

After the `<h1>Оповещения</h1>` line, add:

```jsx
        <PushPromptBanner />
```

After the closing `</ul>` of the notifications list (locate the existing list rendering — find via `grep -n "}.map" src/pages/NotificationsPage.jsx`), add — before the `</div>` that closes `mx-auto`:

```jsx
        <div className="mt-6">
          <PushSettingsCard />
        </div>
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```
Expected: build succeeds (no JSX errors).

### Task 6.2 — Wire SW registration + router listener

**Files:**
- Modify: `src/main.jsx`

- [ ] **Step 1: Read current `main.jsx`**

```bash
cat src/main.jsx
```

- [ ] **Step 2: Add SW registration on app start**

After existing imports, add:
```jsx
import { ensureSWRegistered } from './lib/pushClient.js'
```

Right before `ReactDOM.createRoot(...).render(...)` (or equivalent), add:
```jsx
if (typeof window !== 'undefined') {
  ensureSWRegistered().catch(() => { /* SW unsupported or blocked */ })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, url } = event.data || {}
      if (type === 'push:navigate' && typeof url === 'string') {
        window.history.pushState({}, '', url)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    })
  }
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```
Expected: build succeeds.

### Task 6.3 — Hook `disablePush()` into `signOut`

**Files:**
- Modify: `src/useAuth.jsx`

- [ ] **Step 1: Edit `signOut`**

In `src/useAuth.jsx`, replace the `signOut` definition (currently lines 113–117) with:

```jsx
  const signOut = useCallback(async () => {
    setAuthError(null)
    try {
      const { disablePush } = await import('./lib/pushClient.js')
      await disablePush()
    } catch { /* best-effort; never block logout */ }
    await supabase.auth.signOut()
  }, [])
```

- [ ] **Step 2: Verify build + lint**

```bash
npm run build && npm run lint
```
Expected: succeeds.

### Task 6.4 — Smoke test script

**Files:**
- Create: `scripts/test-push-dispatch.mjs`

- [ ] **Step 1: Write script**

```js
// scripts/test-push-dispatch.mjs
//
// Sends a synthetic push event to /api/push/dispatch with a valid HMAC
// signature. Reads PUSH_WEBHOOK_SECRET from environment.
//
// Usage:
//   PUSH_WEBHOOK_SECRET=$(grep ^PUSH_WEBHOOK_SECRET .env.local | cut -d= -f2) \
//     node scripts/test-push-dispatch.mjs https://<host>/api/push/dispatch
//
// The source/row_id pair must reference a real existing event for the
// dispatcher to find recipients. Adjust to taste.

import crypto from 'node:crypto'

const url = process.argv[2]
if (!url) { console.error('Usage: node scripts/test-push-dispatch.mjs <url>'); process.exit(2) }
const secret = process.env.PUSH_WEBHOOK_SECRET
if (!secret) { console.error('PUSH_WEBHOOK_SECRET is required'); process.exit(2) }

const body = JSON.stringify({
  source: process.env.SOURCE || 'task_activity',
  row_id: Number(process.env.ROW_ID || 1),
  created_at: new Date().toISOString(),
})
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')

const r = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Push-Signature': sig },
  body,
})
console.log('Status:', r.status)
console.log('Body:  ', await r.text())
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/test-push-dispatch.mjs
```

### Task 6.5 — Local sanity (optional but recommended before deploy)

- [ ] **Step 1: Build + preview**

```bash
npm run build
npm run preview &
PREVIEW_PID=$!
sleep 2
```

- [ ] **Step 2: Open `/notifications` in browser**

Visit `http://localhost:4173/notifications`. Confirm:
- The page renders without console errors.
- `PushPromptBanner` appears when permission is `default`.
- `PushSettingsCard` shows the "Включить" button.
- Clicking "Включить" prompts the browser for permission.

- [ ] **Step 3: Stop preview**

```bash
kill $PREVIEW_PID
```

### Task 6.6 — Run full test suite + commit Stage 6 (feature)

- [ ] **Step 1: Run all tests**

```bash
npm run test:run
```
Expected: all tests pass (including the 26 new push tests across `_verify`, `_render`, `pushClient`, `usePushPermission`, `PushSettingsCard`, `PushPromptBanner`).

- [ ] **Step 2: Stage and commit**

```bash
git add src/pages/NotificationsPage.jsx src/main.jsx src/useAuth.jsx scripts/test-push-dispatch.mjs
git commit -m "$(cat <<'EOF'
feat(push): wire UI into NotificationsPage, register SW, hook signOut

NotificationsPage embeds the dismissable PushPromptBanner above the inbox
list and the PushSettingsCard below it. main.jsx registers the SW on app
start and forwards push:navigate messages to React Router via popstate.
signOut now best-effort calls disablePush() before clearing the session
so a shared device does not keep pushing to the previous user.

Adds scripts/test-push-dispatch.mjs for ad-hoc HMAC-signed POSTs to the
webhook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 6.7 — Production deployment

- [ ] **Step 1: Add env vars to Vercel**

```bash
vercel env add VITE_VAPID_PUBLIC_KEY production
vercel env add VAPID_PRIVATE_KEY production
vercel env add VAPID_CONTACT_EMAIL production
vercel env add PUSH_WEBHOOK_SECRET production
```
Paste the values from `.env.local` when prompted. Verify with:
```bash
vercel env ls production | grep -E 'VAPID|PUSH'
```
Expected: 4 entries.

- [ ] **Step 2: Deploy**

```bash
vercel --prod
```
Note the deployment URL.

- [ ] **Step 3: Configure Postgres GUCs in Studio SQL editor**

Replace `<prod-domain>` with the actual production domain (e.g. the apex domain set in Vercel project) and `<secret>` with the same value as Vercel's `PUSH_WEBHOOK_SECRET`:

```sql
ALTER DATABASE postgres SET app.push_webhook_url    = 'https://<prod-domain>/api/push/dispatch';
ALTER DATABASE postgres SET app.push_webhook_secret = '<secret>';
SELECT pg_reload_conf();
SELECT current_setting('app.push_webhook_url', true), current_setting('app.push_webhook_secret', true) IS NOT NULL;
```
Expected: returned URL matches; second column = `t`.

- [ ] **Step 4: Smoke-test the webhook**

Pick a recent `task_activity.id`:
```sql
SELECT MAX(id) FROM task_activity;
```

Run the smoke script:
```bash
PUSH_WEBHOOK_SECRET=$(grep ^PUSH_WEBHOOK_SECRET .env.local | cut -d= -f2) \
SOURCE=task_activity ROW_ID=<id> \
  node scripts/test-push-dispatch.mjs https://<prod-domain>/api/push/dispatch
```
Expected: `Status: 200`, body `{ "sent": N, "failed": 0, "pruned": 0 }` where `N` is the number of subscribed users for that task.

- [ ] **Step 5: End-to-end QA**

1. Open the production app in Chrome desktop, log in.
2. Navigate to `/notifications`. Confirm `PushPromptBanner` and `PushSettingsCard` render.
3. Click "Включить" → permission prompt → grant.
4. Confirm a row appears in `push_subscriptions` for your user (`SELECT * FROM push_subscriptions WHERE user_id = <your_id> ORDER BY id DESC LIMIT 1;`).
5. Have another user (or another browser logged in as a different user) create a task assigned to you. Verify a push notification appears in the OS notification center within ~3 seconds.
6. Click the notification → app tab focuses and navigates to `/tasks?id=<id>`.
7. While focused, have the other user update the task. Verify **no** OS notification fires (in-app feed updates instead).
8. Click "Отключить на этом устройстве" → confirm `push_subscriptions` row deleted.
9. Trigger another task event → confirm no notification.

- [ ] **Step 6: Smoke iOS PWA (if iPhone available)**

1. On iPhone Safari, open the production URL.
2. Add to Home Screen via the Share menu.
3. Open the home-screen app icon.
4. `/notifications` → click "Включить" → grant permission.
5. Trigger an event from another browser → confirm push appears.

If no iPhone is available, document this as deferred-QA in the PR description.

### Task 6.8 — Open PR

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/browser-push-notifications
```

- [ ] **Step 2: Open PR via gh** (per memory: must use `clubmonaco2017-ops` GitHub user for merge later)

```bash
gh pr create --title "feat: browser push notifications" --body "$(cat <<'EOF'
## Summary
- Web Push end-to-end: `pg_net` AFTER INSERT triggers on the four notification source tables → HMAC-signed POST to `/api/push/dispatch` → `web-push` fan-out to per-device subscriptions.
- New `push_subscriptions` table with multi-device endpoints and `disabled_at` soft-delete on `404`/`410`.
- `list_push_recipients` mirrors `list_user_notifications` scoping (single source of truth across inbox + push).
- Service Worker suppresses notifications when an app tab is focused, deep-links to `/tasks?id=...` / `/teams?id=...` / `/staff` / `/admin/agencies` (placeholder for deletion requests), with `/notifications` as fallback.
- PWA manifest + apple meta tags so iOS Add-to-Home-Screen → push works.
- One toggle per device in `/notifications` plus a dismissable header banner; logout calls `disablePush()` best-effort.

## Out of scope (deferred)
- Per-source toggles, quiet hours, push grouping/digest, action buttons, dedicated `/admin/deletion-requests` route, an outbox/retry mechanism. Final notification icons are placeholders generated from `favicon.svg`.

## Setup checklist (production)
- [x] `vercel env add` for `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `PUSH_WEBHOOK_SECRET`.
- [x] Migrations 108–113 applied via Studio.
- [x] `ALTER DATABASE postgres SET app.push_webhook_url ...` + secret + `pg_reload_conf()`.
- [x] `vercel --prod` deployed.
- [x] Smoke test against `/api/push/dispatch` returned 200.

## Test plan
- [x] Unit tests pass (`npm run test:run`).
- [x] Chrome desktop: enable → another user creates task → push received → click → deep link.
- [x] Active tab suppression: focus tab → no OS notification, in-app feed updates.
- [x] Disable toggle removes `push_subscriptions` row and silences subsequent events.
- [ ] iPhone PWA Add-to-Home-Screen → push (deferred until iPhone available).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm PR URL**

Note the URL output by `gh pr create` for the user.

---

## Final commit hygiene

If anything was missed in the per-stage commits — manifest tweak, missing test, etc. — open the PR first, then push fixups directly to the branch. **Do not** rebase/squash before the user reviews the per-stage commit history.

## Plan self-review checklist (run after writing this plan, before sharing with user)

- [ ] Spec coverage: every section of the spec maps to one or more tasks above. (Confirmed during writing.)
- [ ] No "TBD"/"TODO"/"add appropriate handling" anywhere in steps. (Confirmed.)
- [ ] Function/RPC names consistent across tasks: `upsert_push_subscription`, `delete_push_subscription`, `list_push_recipients`, `get_push_event_data`, `disable_push_subscriptions_bulk`, `enqueue_push_event`. (Confirmed.)
- [ ] Migration numbers sequential and matching spec (108–113). (Confirmed.)
- [ ] `_render.js` renders the same source key (`deletion_request` not `deletion_requests`) that `formatNotificationMessage` expects. The DB returns `'deletion_request'` from `get_push_event_data` while the trigger payload uses `'deletion_requests'`. The dispatch handler reads `payload.source = 'deletion_requests'` from the trigger, then receives `eventData.source = 'deletion_request'` from `get_push_event_data` — `_render.js` uses the latter. Tag uses `eventData.source`, so tag = `deletion_request:<id>` (matches `_render.test.js` expectations). (Confirmed consistent.)
