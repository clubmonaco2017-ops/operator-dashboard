import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from './_supabase.js'

const SUPABASE_URL = 'https://akpddaqpggktefkdecrl.supabase.co'

export class Unauthorized extends Error {
  constructor(message) {
    super(message)
    this.status = 401
  }
}

export class Forbidden extends Error {
  constructor(message) {
    super(message)
    this.status = 403
  }
}

/**
 * Validates the caller from the Authorization: Bearer <jwt> header against
 * Supabase Auth, then resolves the dashboard_users row linked via auth_user_id.
 *
 * Returns the dashboard user id + role for use in role-gated handlers.
 *
 * Throws Unauthorized when:
 *   - no Authorization header
 *   - JWT invalid / expired
 *   - no dashboard_users row linked to auth.uid (unlinked user)
 *   - linked user is not is_active
 */
export async function verifyCaller(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization
  if (!authHeader) throw new Unauthorized('missing Authorization header')

  // Support both server-style (SUPABASE_ANON_KEY) and Vite-style
  // (VITE_SUPABASE_ANON_KEY) env names — Vercel projects often only
  // configure the latter.
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) is not set')
  }

  const authClient = createClient(SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userRes, error: jwtErr } = await authClient.auth.getUser()
  if (jwtErr || !userRes?.user) throw new Unauthorized('invalid JWT')

  const sb = getSupabaseAdmin()
  const { data: dbUser, error: lookupErr } = await sb
    .from('dashboard_users')
    .select('id, role, is_active')
    .eq('auth_user_id', userRes.user.id)
    .maybeSingle()

  if (lookupErr) throw new Unauthorized('lookup failed')
  if (!dbUser) throw new Unauthorized('unlinked dashboard user')
  if (!dbUser.is_active) throw new Unauthorized('inactive user')

  return { callerId: dbUser.id, role: dbUser.role }
}

/**
 * Wraps verifyCaller and writes the appropriate error response on failure.
 * Returns null when an error response was written (caller should `return`).
 * Returns the verified caller object otherwise.
 */
export async function authorize(req, res, { requireRoles } = {}) {
  let caller
  try {
    caller = await verifyCaller(req)
  } catch (e) {
    const status = e instanceof Unauthorized ? 401 : 500
    res.status(status).json({ error: e.message || 'Unauthorized' })
    return null
  }

  if (requireRoles && !requireRoles.includes(caller.role)) {
    res.status(403).json({ error: 'forbidden: insufficient role' })
    return null
  }

  return caller
}
