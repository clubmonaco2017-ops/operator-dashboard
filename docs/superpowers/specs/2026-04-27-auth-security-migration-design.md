# Auth Security Migration · Design Spec (DRAFT — backlog)

**Status:** Documented for backlog. **Not approved for implementation yet.** Architectural decision needed before scoping.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Scope:** Authentication architecture rewrite. Independent from the design-system rollout (Subplan 6 family).

---

## 1. The problem

The application uses a **custom auth scheme over Supabase RPCs that does not verify the caller's identity.** Every privileged RPC takes `p_caller_id integer` as a regular function argument, supplied by the frontend. The backend has no cryptographic proof that the caller is who they claim to be.

### Concrete impact

The Supabase anon API key is shipped to the browser (normal Supabase practice). With that key, anyone can call any RPC and **impersonate any user by passing their integer id**:

```js
// Open browser devtools on any logged-out page, paste:
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient('https://akpddaqpggktefkdecrl.supabase.co', '<anon-key-from-bundle>')
await sb.rpc('update_staff_profile', {
  p_caller_id: 1,             // pretend to be user_id=1 (superadmin)
  p_user_id: 1,
  p_first_name: 'PWNED',
})
// Operation succeeds because has_permission(1, 'create_users') is true.
```

User ids are sequential integers starting at 1, so brute-forcing identity is trivial. **No password is required.**

### Why this exists

The application doesn't use Supabase Auth (the platform's JWT-based identity system). Instead, password verification happens once at login (via `auth_login` RPC + `pgcrypto.crypt()`), the resulting user row is stored unsigned in `localStorage`, and every subsequent RPC takes the user_id as a plain function argument. There is no signed session token or server-side identity verification.

### What is done correctly

- Passwords hashed via `pgcrypto.crypt()` (bcrypt-style); the `auth_login` RPC compares `password_hash = crypt(p_password, password_hash)`.
- 6 sensitive tables have RLS enabled (`clients`, `client_media`, `client_activity`, `teams`, `team_members`, `team_clients`, `moderator_operators`, `deletion_requests`, `user_permissions`, `user_attributes` — direct table access from the browser blocked).
- All mutations go through `SECURITY DEFINER` RPCs with `has_permission(p_caller_id, '<perm>')` gating.
- `SET search_path = public, extensions` on RPCs — defended against search-path injection.
- `is_active` filter on login — deactivated users can't authenticate.
- Transport encrypted (HTTPS via Supabase + Vercel).

The permission-check logic is correct. The only flaw is the identity on the input — but that flaw negates everything else.

---

## 2. Secondary issues (smaller)

| Issue | Severity | Note |
|---|---|---|
| Session in `localStorage` without signature | Medium | XSS → full session takeover. No httpOnly cookies. |
| No rate limiting on `auth_login` | Medium | Brute-force possible against publicly callable RPC. Supabase platform-level abuse protection only. |
| No account lockout after N failed logins | Medium | Combined with the above, password guessing is unbounded. |
| Minimum password length = 6 | Low | NIST recommends 8+ and HIBP checks. |
| No 2FA | Medium | CRM holds finance/PII data; recommended for ops accounts. |
| No audit log of login attempts | Medium | Brute-force / suspicious activity invisible. |
| `GRANT EXECUTE ... TO anon, authenticated` blanket pattern | Depends on grep audit | If every RPC grants anon, and `caller_id` isn't verified, the entire API is open without login. Audit needed. |

---

## 3. Three migration strategies

### A. Full migration to Supabase Auth (recommended long-term)

Replace the custom auth scheme with Supabase Auth (JWT-based identity).

- `supabase.auth.signInWithPassword({ email, password })` instead of `auth_login` RPC.
- Drop `p_caller_id` argument from every RPC; replace with `auth.uid()` inside the function (or `(SELECT auth.uid())::integer` mapped via a `dashboard_users.auth_user_id` foreign key).
- RLS policies can directly reference `auth.uid()` — many existing RPCs become unnecessary because RLS handles authorization.
- Sessions managed by Supabase (refresh tokens, optional httpOnly cookies via SSR).
- 2FA, password reset emails, magic links, OAuth become available out of the box.

**Cost:**
- Refactor every RPC (≈30+ migrations) to drop `p_caller_id`.
- Refactor every frontend call site that passes `user.id` (every hook, page, component using `useAuth`).
- Migrate existing users into Supabase Auth: either force a password reset (users get an email), or run a custom migration that creates `auth.users` entries linked to `dashboard_users` (Supabase Auth has its own password store; can't hot-copy bcrypt hashes from `dashboard_users.password_hash` into it without an unsupported workaround).
- Touch points: `useAuth.jsx`, `LoginPage.jsx`, every RPC migration, every hook, every page-level data call.

**Estimated effort:** 1-2 weeks for a full rewrite.

### B. Signed JWT in custom-auth scheme (middle ground)

Keep `dashboard_users` and `auth_login`, but issue a signed JWT on successful login:

- `auth_login` returns a JWT signed with a server-side secret (Supabase Edge Function or pgjwt extension).
- Frontend stores JWT in `localStorage` and sends as `Authorization: Bearer <jwt>` header on every request.
- RPCs verify the JWT via a helper function and extract the verified user_id, replacing `p_caller_id`.
- Permission checks remain unchanged.

**Cost:**
- Adds Edge Function dependency (or pgjwt extension).
- Every RPC needs to call a JWT-verification helper at the top.
- Less ecosystem benefit than (A) — no built-in 2FA, password reset, etc.

**Estimated effort:** 1-2 days.

### C. Quick patch: revoke anon EXECUTE, require auth-only RPCs

Revoke `EXECUTE` from `anon` role on all sensitive RPCs (keep only `auth_login` callable as anon). Require Supabase Auth session to call any other RPC, even though `p_caller_id` remains client-controlled.

**Cost:** Low (a few migration lines).

**Effectiveness:** Limited. Once a user has a Supabase Auth session (even a basic one created post-login by some adapter), they can still impersonate others by passing arbitrary `p_caller_id`. **This is not a real fix — it's defense-in-depth at most.** Still requires (A) or (B) for the actual gap.

---

## 4. Recommendation

**Strategy A** (full Supabase Auth migration) is the right destination. Strategy B is a tactical patch if A's scope is too large for the current sprint. Strategy C is **not** a substitute — it doesn't close the gap.

**Decision points the team needs to make before scoping the implementation plan:**

1. **A or B?** Full Supabase Auth or signed-JWT middle ground.
2. **Force-reset all passwords (if A)?** Or preserve passwords via custom migration script using Supabase Auth admin API (`auth.admin.createUser({ email, password })` per user, rehashed on Supabase's terms)?
3. **Cutover strategy:** big-bang vs. dual-running both auth paths during transition?
4. **2FA in scope, or follow-up?**
5. **Production exposure?** If the app is currently on the public internet with real users, this becomes urgent. If only used internally on a known network, lower priority.

---

## 5. Status & next steps

- This document is **NOT a green-lit spec.** It captures the findings and trade-offs.
- Before writing an implementation plan, the team needs to make the 5 decisions in §4.
- Suggested cadence: pair on architectural decisions in a dedicated session, then I write a focused spec for the chosen strategy, then writing-plans, then execute.
- **Until this is fixed, treat the production deployment as a pre-launch / staging environment.** Don't seed real customer data, real revenue numbers, or real PII at scale.
