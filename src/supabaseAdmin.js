import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://akpddaqpggktefkdecrl.supabase.co'

let _client = null

export function getSupabaseAdmin() {
  if (_client) return _client
  const key = import.meta.env.VITE_SUPABASE_SERVICE_KEY
  if (!key) throw new Error('VITE_SUPABASE_SERVICE_KEY не задан')
  _client = createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}
