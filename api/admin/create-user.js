import { getSupabaseAdmin } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { caller_id, email, password, role, permissions } = req.body || {}
    if (!caller_id) return res.status(401).json({ error: 'Unauthorized' })

    const sb = getSupabaseAdmin()
    const { data, error: err } = await sb.rpc('create_user', {
      p_email: email,
      p_password: password,
      p_role: role,
      p_permissions: permissions,
    })
    if (err) return res.status(500).json({ error: err.message })

    return res.status(200).json({ data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
