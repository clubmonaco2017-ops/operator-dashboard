import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://akpddaqpggktefkdecrl.supabase.co'

let _client = null

export function getSupabaseAdmin() {
  if (_client) return _client
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_KEY is not set')
  _client = createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function error(message, status = 400) {
  return json({ error: message }, status)
}
