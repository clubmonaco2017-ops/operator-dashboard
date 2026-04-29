import { getSupabaseAdmin } from './_supabase.js'
import { authorize } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await authorize(req, res)
  if (!caller) return

  try {
    const { action, ...params } = req.body || {}

    const sb = getSupabaseAdmin()

    switch (action) {
      case 'list': {
        const { data, error } = await sb
          .from('agencies')
          .select('*, platforms(id, name, logo_url)')
          .order('created_at', { ascending: true })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'create': {
        const { platform_id, name, logo_url, contacts, access_login, access_password, notes } = params
        const { data, error } = await sb
          .from('agencies')
          .insert({ platform_id, name, logo_url, contacts: contacts || [], access_login, access_password, notes })
          .select('*, platforms(id, name, logo_url)')
          .single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'update': {
        const { id, platform_id, name, logo_url, contacts, access_login, access_password, notes } = params
        const { data, error } = await sb
          .from('agencies')
          .update({ platform_id, name, logo_url, contacts: contacts || [], access_login, access_password, notes })
          .eq('id', id)
          .select('*, platforms(id, name, logo_url)')
          .single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'delete': {
        const { id } = params
        const { error } = await sb
          .from('agencies')
          .delete()
          .eq('id', id)
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data: { success: true } })
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
