import { getSupabaseAdmin } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { caller_id, user_id, new_password } = req.body || {}
    if (!caller_id) return res.status(401).json({ error: 'Unauthorized' })

    const sb = getSupabaseAdmin()
    const { data, error: err } = await sb.rpc('update_user_password', {
      p_user_id: user_id,
      p_new_password: new_password,
    })
    if (err) return res.status(500).json({ error: err.message })

    return res.status(200).json({ data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
