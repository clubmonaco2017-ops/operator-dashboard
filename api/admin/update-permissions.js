import { getSupabaseAdmin } from './_supabase.js'
import { authorize } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await authorize(req, res)
  if (!caller) return

  try {
    const { user_id, permissions } = req.body || {}

    const sb = getSupabaseAdmin()
    const { data, error: err } = await sb.rpc('update_user_permissions', {
      p_user_id: user_id,
      p_permissions: permissions,
    })
    if (err) return res.status(500).json({ error: err.message })

    return res.status(200).json({ data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
