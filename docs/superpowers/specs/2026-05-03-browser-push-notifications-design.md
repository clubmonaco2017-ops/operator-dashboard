# Browser Push Notifications — Design Spec

**Date:** 2026-05-03
**Author:** brainstorming session (Claude + Artem)
**Status:** Design approved; pending plan write-up
**Predecessors:** PR #69 (task unread), PR #70 (realtime sync), PR #71+#72 (notifications inbox MVP)
**Effort estimate:** 3–5 working days

---

## 1. Goal

Deliver browser push notifications for the operator dashboard so users receive
out-of-tab alerts for the four activity sources already surfaced in the
in-app inbox: `task_activity`, `team_activity`, `staff_activity`,
`deletion_requests`.

The push channel must reuse — not duplicate — the per-role scoping and event
filtering already implemented in `list_user_notifications` (migrations 92–107).
The in-app realtime sync remains the source of truth for the inbox; push is an
additional surface that fires when the user is not actively looking at the app.

## 2. Non-goals (deferred)

- Per-source toggles (tasks/teams/staff/admin).
- Quiet hours, timezone-aware delivery.
- Notification grouping / digest batching.
- Rich notifications (action buttons, images).
- Android install-prompt customisation.
- An at-least-once outbox/retry mechanism (only if `pg_net` reliability proves
  insufficient in production).
- Approach B (per-row notification table with read state) — Approach A
  (computed feed) remains in place.

## 3. Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Push scope | All four inbox sources, scoping reuses `list_user_notifications` logic. |
| Sender architecture | `pg_net` AFTER INSERT triggers → Vercel `/api/push/dispatch` webhook (HMAC-signed). |
| Permission UX | (a) CTA settings card in `/notifications`; (b) dismissable inline header banner on first visit. No automatic prompt outside user gesture. |
| Click target | Deep link to entity page (`/tasks/:id`, `/teams/:id`, `/staff/:id`); fallback to `/notifications` when route or entity is missing. |
| Multi-device | One row per browser endpoint in `push_subscriptions`; on `410 Gone` from push service, mark `disabled_at`. |
| iOS / PWA | Add manifest, apple-touch-icon, apple-mobile-web-app meta tags. iOS users see "Add to Home Screen" hint. No bespoke iOS onboarding. |
| Preferences | Single per-device on/off toggle. Anti-noise = SW skips notification when app tab is focused. |
| Replay protection | Webhook rejects events whose `created_at` is older than 5 minutes. |
| Logout cleanup | `disablePush()` called as part of logout — removes endpoint from DB and unsubscribes the browser. |
| Deletion request deep link | Placeholder `/admin/agencies`. Revisit when a dedicated screen exists. |
| Icons | Placeholder PNGs derived from existing `public/favicon.svg`. Final art is a separate design task. |

## 4. Architecture overview

```
┌─────────────────┐   INSERT       ┌────────────────────────┐
│ tasks/teams/    │──────────────►│ task_activity /        │
│ staff/deletion  │ (existing)    │ team_activity /        │
│ user actions    │               │ staff_activity /       │
└─────────────────┘               │ deletion_requests      │
                                   └─────────┬──────────────┘
                                             │ AFTER INSERT trigger
                                             ▼
                                   ┌────────────────────────┐
                                   │ enqueue_push_event()   │
                                   │  pg_net.http_post →    │
                                   │  /api/push/dispatch    │
                                   │  body + HMAC sig       │
                                   └─────────┬──────────────┘
                                             │ async
                                             ▼
                                   ┌────────────────────────┐
                                   │ Vercel /api/push/dispatch │
                                   │ 1. verify HMAC + freshness│
                                   │ 2. list_push_recipients() │
                                   │ 3. render_push_payload()  │
                                   │ 4. web-push.send() *N     │
                                   │ 5. on 404/410 → disable   │
                                   └─────────┬──────────────┘
                                             │ HTTPS POST
                                             ▼
                                   ┌────────────────────────┐
                                   │ Browser SW (/sw.js)    │
                                   │ - push event           │
                                   │ - clients.matchAll →   │
                                   │   suppress if visible  │
                                   │ - showNotification     │
                                   │ - notificationclick →  │
                                   │   focus tab / openWindow│
                                   └────────────────────────┘
```

**Idempotency.** Each notification uses `tag: <source>:<row_id>`. Duplicate
deliveries replace the existing notification rather than creating dupes.

**Single source of truth for scoping.** Server-side filtering happens in
`list_push_recipients(p_source, p_row_id)` (SQL), which mirrors the role-aware
filtering already in `list_user_notifications`. Client-side push UI does not
re-implement scoping.

## 5. Database changes

All new migrations follow naming convention `20260504_NN_<topic>.sql`.

### 5.1 Migration 108 — `push_subscriptions` table

```sql
CREATE TABLE public.push_subscriptions (
  id            bigserial PRIMARY KEY,
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
```

RLS stays disabled. All access goes through SECURITY DEFINER RPCs (existing
project convention).

### 5.2 Migration 109 — subscription CRUD RPCs

```sql
upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
  RETURNS bigint  -- subscription id
  -- INSERT ... ON CONFLICT (endpoint) DO UPDATE
  --   SET user_id = current_dashboard_user_id(),
  --       p256dh = excluded.p256dh,
  --       auth = excluded.auth,
  --       user_agent = excluded.user_agent,
  --       last_seen_at = now(),
  --       disabled_at = NULL

delete_push_subscription(p_endpoint text) RETURNS void
  -- DELETE FROM push_subscriptions
  --   WHERE endpoint = p_endpoint
  --     AND user_id = current_dashboard_user_id();
```

`current_dashboard_user_id()` already exists (used by other RPCs). RAISE if
caller is unauthenticated.

### 5.3 Migration 110 — `list_push_recipients`

```sql
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
-- Switch on p_source. For each source, build the recipient set using the
-- same per-role filtering that list_user_notifications applies, minus the
-- actor (actor_id IS DISTINCT FROM recipient_id).
-- Join push_subscriptions ON user_id, filtered by disabled_at IS NULL
-- and dashboard_users.is_active = true.
$$;

GRANT EXECUTE ON FUNCTION public.list_push_recipients(text, bigint)
  TO authenticated, service_role;
```

Per-source recipient logic:

| Source | Recipients (per-role) |
|---|---|
| `task_activity` | operator/lead/mod: `assigned_to` and `created_by`; admin: users in same agency as task assignee (via `admin_agencies`); superadmin: all. Exclude actor. |
| `team_activity` | operator/lead/mod: members of the team plus team lead; admin: agency-scoped; superadmin: all. Exclude actor. |
| `staff_activity` | operator/lead/mod: target user only; admin: target user agency in admin's agencies; superadmin: all. Exclude actor. |
| `deletion_requests` | superadmins only, all of them. |

### 5.4 Migration 111 — `pg_net` extension + AFTER INSERT triggers

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;  -- creates schema `net` automatically

CREATE OR REPLACE FUNCTION public.enqueue_push_event() RETURNS trigger AS $$
DECLARE
  v_url    text := current_setting('app.push_webhook_url', true);
  v_secret text := current_setting('app.push_webhook_secret', true);
  v_body   jsonb;
  v_sig    text;
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;  -- no-op when not configured (local dev)
  END IF;

  v_body := jsonb_build_object(
    'source',     TG_TABLE_NAME,
    'row_id',     NEW.id,
    'created_at', NEW.created_at
  );
  v_sig := encode(hmac(v_body::text::bytea, v_secret::bytea, 'sha256'), 'hex');

  PERFORM net.http_post(
    url     := v_url,
    body    := v_body,
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'X-Push-Signature', v_sig
    )
  );
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER push_event_task_activity     AFTER INSERT ON public.task_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();
CREATE TRIGGER push_event_team_activity     AFTER INSERT ON public.team_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();
CREATE TRIGGER push_event_staff_activity    AFTER INSERT ON public.staff_activity
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();
CREATE TRIGGER push_event_deletion_requests AFTER INSERT ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push_event();
```

Webhook URL and secret are stored as database-level GUCs:

```sql
ALTER DATABASE postgres SET app.push_webhook_url    = 'https://<prod>/api/push/dispatch';
ALTER DATABASE postgres SET app.push_webhook_secret = '<32-byte hex>';
SELECT pg_reload_conf();
```

Run this once via Supabase Studio SQL editor in production. In environments
where the GUCs are not set, the trigger returns `NEW` without calling
`net.http_post` — safe for local development.

### 5.5 Migration 112 — `render_push_payload`

```sql
CREATE OR REPLACE FUNCTION public.render_push_payload(
  p_source text,
  p_row_id bigint
)
RETURNS jsonb
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
-- Returns { title, body, url, tag, icon? } for the given event.
-- Russian copy mirrors NotificationRow / list_user_notifications wording.
-- url = deep link based on source.
-- tag = '<source>:<row_id>' for dedup.
$$;
```

Text templates live inside this function. They MUST stay in sync with
`NotificationRow.jsx`. The implementation plan lists this as an explicit
maintenance note.

### 5.6 Migration 113 — bulk-disable helper

```sql
CREATE OR REPLACE FUNCTION public.disable_push_subscriptions_bulk(
  p_endpoints text[]
) RETURNS integer
SECURITY DEFINER
LANGUAGE sql
AS $$
  UPDATE public.push_subscriptions
     SET disabled_at = now()
   WHERE endpoint = ANY(p_endpoints)
     AND disabled_at IS NULL
   RETURNING 1;
$$;

GRANT EXECUTE ON FUNCTION public.disable_push_subscriptions_bulk(text[])
  TO service_role;
```

Called from `/api/push/dispatch` after `404`/`410` responses from push
services.

## 6. Server (Vercel `/api/push/dispatch`)

**Location:** `api/push/dispatch.js` — new directory `api/push/`.

**Runtime:** Node.js (web-push requires it; explicit `export const config =
{ runtime: 'nodejs' }`).

**Steps:**

1. Read raw body. Compute HMAC-SHA256 of raw body with `PUSH_WEBHOOK_SECRET`.
   Compare with `X-Push-Signature` header using `crypto.timingSafeEqual`.
2. Parse body `{ source, row_id, created_at }`. Reject if missing fields.
3. Reject if `created_at` is older than 5 minutes (replay protection).
4. RPC `list_push_recipients(p_source, p_row_id)` → list of subscriptions
   (endpoint + p256dh + auth).
5. RPC `render_push_payload(p_source, p_row_id)` → `{ title, body, url, tag }`.
6. `Promise.allSettled(recipients.map(webpush.sendNotification(...)))` with TTL
   86400.
7. Collect endpoints whose response was `404` or `410`. RPC
   `disable_push_subscriptions_bulk(p_endpoints)`.
8. Return `{ sent, failed, pruned }`.

**Auth:** No JWT. Security is HMAC-only. The endpoint is otherwise
anonymous (any caller able to forge HMAC with the secret can dispatch — secret
lives in Vercel env and Postgres GUC, never in client code).

**Errors:**
- HMAC fail → 401, no body details.
- Replay window exceeded → 401.
- Body malformed → 400.
- RPC failure → 500 with safe error string (no DB internals leaked).

**Existing helpers (`api/admin/_supabase.js`)** already provide
`getSupabaseAdmin()`, `json()`, `error()`. Reuse them.

## 7. Client integration

### 7.1 Service Worker (`public/sw.js`)

Plain JS, not bundled. Contains three handlers.

```js
self.addEventListener('push', (event) => event.waitUntil(handlePush(event)))
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(handleClick(event.notification.data?.url ?? '/notifications'))
})
self.addEventListener('pushsubscriptionchange', (event) => event.waitUntil(resubscribe()))
```

**`handlePush`:**
- Parse JSON payload.
- `clients.matchAll({ type: 'window', includeUncontrolled: true })`. If any
  client is `visibilityState === 'visible'` and `focused`, post a message
  `{ type: 'push:received', payload }` to that client and **return** (no OS
  notification — in-app realtime already updates the inbox).
- Otherwise `self.registration.showNotification(title, { body, tag, icon,
  badge, data: { url }, renotify: false })`.

**`handleClick`:**
- Find existing client with same origin → `focus()` and post
  `{ type: 'push:navigate', url }` (SPA navigation handled in React Router
  listener).
- No client → `self.clients.openWindow(url)`.

**`pushsubscriptionchange`:** browser rotated keys. Re-subscribe via
`registration.pushManager.subscribe()` and persist by calling the existing
`upsert_push_subscription` RPC. If the user is logged out at this point,
silently fail.

### 7.2 Client library (`src/lib/pushClient.js`)

```js
ensureSWRegistered()
enablePush(userId)        -> { state, endpoint }
disablePush()             -> void
getPushState()            -> 'unsupported' | 'default' | 'granted' | 'denied'
isIosNonStandalone()      -> boolean
urlBase64ToUint8Array(s)  -> Uint8Array  // VAPID key conversion
```

`enablePush` flow:

1. Register SW if not yet registered.
2. If `Notification.permission === 'default'` call `requestPermission()`.
3. If still not `'granted'` return `{ state }`.
4. `pushManager.getSubscription()` → if missing, `subscribe()` with
   `userVisibleOnly: true` and the VAPID public key.
5. Persist via `supabase.rpc('upsert_push_subscription', ...)`.

`disablePush` is the inverse: remove from DB then `subscription.unsubscribe()`.

### 7.3 React hook (`src/hooks/usePushPermission.js`)

Returns `{ state, isSubscribed, supported, iosHint }`. Reactive via
`permissionchange` event when supported. Re-checks `pushManager.getSubscription()`
on `visibilitychange` so multi-tab updates settle.

### 7.4 UI components

**`PushSettingsCard.jsx`** — settings card in `/notifications` below filters.

| State | UI |
|---|---|
| `unsupported` | Static text "Браузер не поддерживает push". |
| iOS non-standalone | Instructions "Добавьте на главный экран чтобы получать уведомления на iPhone". |
| `default` | Toggle off + button "Включить" → `enablePush()`. |
| `granted` + subscribed | Toggle on + button "Отключить на этом устройстве" → `disablePush()`. |
| `granted` + not subscribed (rare) | Auto-subscribe silently and show subscribed state. |
| `denied` | Static info block + collapsible "Как разблокировать" instructions. |

Footer note: "Уведомления настраиваются для каждого устройства/браузера
отдельно".

**`PushPromptBanner.jsx`** — dismissable header banner.

- Visible only if `state === 'default'` AND localStorage flag
  `push_prompt_dismissed_at` is absent or older than 7 days.
- Copy: "Получайте уведомления, даже когда вкладка закрыта."
- Buttons: `[Включить]` (primary) and `[X]` (dismiss).
- iOS non-standalone variant: replaces button with "Add to Home Screen" hint.
- Hides itself once permission moves out of `default`.

### 7.5 Bootstrap and logout

- `src/main.jsx` calls `ensureSWRegistered()` after auth bootstrap.
- React Router-level listener handles `push:navigate` messages from SW.
- Logout flow (existing `signOut` helper) calls `disablePush()` before
  clearing session — best-effort, never blocks logout on failure.

## 8. PWA manifest and icons

New file `public/manifest.webmanifest`:

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

New PNG assets (placeholders rasterised from `public/favicon.svg`):

```
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-maskable-512.png
public/icons/notification-192.png
public/icons/badge-72.png
public/icons/apple-touch-icon-180.png
```

`index.html` additions:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0f172a" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Dashboard" />
```

## 9. Configuration and secrets

**Local (`.env.local`)** — new keys:

```
VITE_VAPID_PUBLIC_KEY=<base64url>
VAPID_PRIVATE_KEY=<base64url>
VAPID_CONTACT_EMAIL=temash@gmail.com
PUSH_WEBHOOK_SECRET=<32-byte hex>
```

**Vercel production** (team `clubmonaco2017-ops-projects`, deploy via
`vercel --prod`): same keys via `vercel env add`.

**Postgres GUCs** (Studio SQL editor, one-time):

```sql
ALTER DATABASE postgres SET app.push_webhook_url    = 'https://<prod-domain>/api/push/dispatch';
ALTER DATABASE postgres SET app.push_webhook_secret = '<same as PUSH_WEBHOOK_SECRET>';
SELECT pg_reload_conf();
```

**VAPID key generation** — `scripts/generate-vapid.mjs`:

```js
import webpush from 'web-push'
console.log(webpush.generateVAPIDKeys())
```

Run once: `node scripts/generate-vapid.mjs`.

**npm dep:** `npm i web-push`.

**`vercel.json` headers** for SW and manifest:

```json
{
  "headers": [
    { "source": "/sw.js",
      "headers": [
        { "key": "Content-Type",            "value": "application/javascript; charset=utf-8" },
        { "key": "Cache-Control",           "value": "public, max-age=0, must-revalidate" },
        { "key": "Service-Worker-Allowed",  "value": "/" }
      ]
    },
    { "source": "/manifest.webmanifest",
      "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }]
    }
  ]
}
```

`max-age=0` is essential — otherwise SW updates can stick to a stale copy.

## 10. File layout

**New files:**

```
api/push/
  dispatch.js
public/
  sw.js
  manifest.webmanifest
  icons/
    icon-192.png
    icon-512.png
    icon-maskable-512.png
    notification-192.png
    badge-72.png
    apple-touch-icon-180.png
scripts/
  generate-vapid.mjs
src/lib/
  pushClient.js
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
  20260504_112_rpc_render_push_payload.sql
  20260504_113_rpc_disable_push_subscriptions_bulk.sql
```

**Modified files:**

```
index.html                          — manifest link, apple meta tags
package.json                        — + web-push
vercel.json                         — + headers block
src/main.jsx                        — ensureSWRegistered() + push:navigate listener
src/pages/NotificationsPage.jsx     — embed PushSettingsCard + PushPromptBanner
<auth signOut helper>               — call disablePush() before clearing session
.env.local                          — manual, not committed
```

**Untouched:**

- `useNotifications*` hooks — push does not change inbox feed.
- Existing realtime sync — push complements, does not replace.
- `list_user_notifications` — push reuses scoping via separate
  `list_push_recipients` RPC, leaves the inbox signature stable.

## 11. Testing

### 11.1 Unit (vitest)

| File | Coverage |
|---|---|
| `usePushPermission.test.js` | mock `navigator.serviceWorker`, `Notification`, `PushManager`. Cases: unsupported, default, granted+subscribed, denied, iOS non-standalone. |
| `pushClient.test.js` (in `src/lib/`) | `enablePush`/`disablePush`/`urlBase64ToUint8Array` (known test vector). |
| `PushSettingsCard.test.jsx` | each state renders correctly; toggle interactions invoke the right RPC mock. |
| `PushPromptBanner.test.jsx` | dismiss persistence (localStorage), shows only on `default`, hides after grant. |

### 11.2 SQL (Studio editor, manual)

- `list_push_recipients('task_activity', :id)` for each role — verify actor
  excluded, agency scoping correct, disabled subscriptions filtered.
- `render_push_payload('task_activity', :id)` — title/body/url non-empty, tag
  matches `task_activity:<id>`.
- `enqueue_push_event` trigger — INSERT a row, then check
  `select * from net._http_response order by id desc limit 1`.

### 11.3 Webhook smoke test

`scripts/test-push-dispatch.mjs` (dev tool, not committed if it reads secrets):

- POST with valid HMAC → expect 200 and `sent` count.
- POST with mangled signature → expect 401.
- POST with `created_at` 10 min old → expect 401 (replay).

### 11.4 Manual QA matrix

| Browser / device | Install required | Expected |
|---|---|---|
| Chrome desktop | no | permission prompt → push received → click opens deep link |
| Firefox desktop | no | same |
| Safari macOS 16.4+ | no | same |
| Chrome Android | optional | push received; clicking opens deep link |
| Safari iOS — browser | yes (Add to Home Screen) | settings card shows iOS hint, no prompt |
| Safari iOS — installed PWA | — | permission prompt → push received |

### 11.5 Scenarios

1. User A creates task for B → B receives push (if subscribed); A does not.
2. B has tab focused → no OS notification, in-app feed updates via existing realtime.
3. B has tab closed → notification appears in OS notification center.
4. Click notification → focus existing tab or open `/tasks/:id`.
5. Logout → subscription is removed from DB and the browser unsubscribes.
6. `410 Gone` → subscription marked `disabled_at`; subsequent dispatches skip it.
7. Standalone PWA refresh on iOS → SW retains subscription.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `pg_net` not enabled on Supabase | Migration 111 runs `CREATE EXTENSION IF NOT EXISTS pg_net`. On Supabase the extension is preinstalled; if it errors, enable via Studio Database → Extensions. |
| Webhook downtime → events lost | Acceptable for notifications; in-app inbox remains the source of truth. Outbox can be added later if needed. |
| `pg_net` background worker backpressure | Supabase tolerates ~200 concurrent outbound HTTP. Current event volume is far below this. |
| Russian copy in `render_push_payload` drifts from in-app text | The maintenance note appears in the implementation plan: when `NotificationRow` copy changes, update migration 112 (or a follow-up migration). |
| iOS install rate < 100% | Memory decision: accepted. Settings card explains "Add to Home Screen". |
| Replay attack on webhook | HMAC + 5-minute freshness window. |
| Privacy: subscription persists across user switches on a shared device | Logout calls `disablePush()` which deletes the row and unsubscribes the browser. |

## 13. Out-of-scope (for future PRs)

- Per-source preference toggles.
- Quiet hours / timezone-aware delivery.
- Push grouping or digest batching.
- Rich notifications (action buttons, images).
- Dedicated `/admin/deletion-requests` screen (currently using `/admin/agencies`).
- Reliability outbox (only if `pg_net` flakiness becomes real in production).
- Final notification icon artwork (placeholder PNGs ship now).

## 14. Out-of-band setup checklist (production)

- [ ] `vercel env add VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_CONTACT_EMAIL PUSH_WEBHOOK_SECRET`.
- [ ] Apply migrations 108–113.
- [ ] Run GUC `ALTER DATABASE` statements via Studio SQL editor.
- [ ] Deploy via `vercel --prod`.
- [ ] Smoke-test with `scripts/test-push-dispatch.mjs` against the production endpoint.
- [ ] Subscribe a personal browser; trigger a sample task event; verify the push arrives.
