import { supabase } from '../supabaseClient'

/**
 * POST to an /api/admin/* endpoint with the current Supabase session attached
 * as `Authorization: Bearer <jwt>`. Replaces the old client-supplied
 * `caller_id` body field — the server resolves the caller from the JWT now.
 *
 * Mirrors the legacy `adminApi`/`agencyApi`/`platformApi` return shape:
 * `{ data, error }` where `error` is `{ message }`.
 */
export async function adminFetch(path, body = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) {
    return { data: null, error: { message: 'Не авторизован' } }
  }

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  let json
  try {
    json = await res.json()
  } catch {
    json = {}
  }

  if (!res.ok || json.error) {
    return { data: null, error: { message: json.error || 'Unknown error' } }
  }
  return { data: json.data, error: null }
}
