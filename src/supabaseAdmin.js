import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://akpddaqpggktefkdecrl.supabase.co'
const SERVICE_ROLE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY || ''

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
