import { getSupabaseAdmin } from './_supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action, caller_id, ...params } = req.body || {}
    if (!caller_id) return res.status(401).json({ error: 'Unauthorized' })

    const sb = getSupabaseAdmin()

    switch (action) {
      case 'list': {
        const { data, error } = await sb
          .from('platforms')
          .select('*')
          .order('created_at', { ascending: true })
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'create': {
        const { name, logo_url, contacts, access_login, access_password, notes } = params
        const { data, error } = await sb
          .from('platforms')
          .insert({ name, logo_url, contacts: contacts || [], access_login, access_password, notes })
          .select()
          .single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'update': {
        const { id, name, logo_url, contacts, access_login, access_password, notes } = params
        const { data, error } = await sb
          .from('platforms')
          .update({ name, logo_url, contacts: contacts || [], access_login, access_password, notes })
          .eq('id', id)
          .select()
          .single()
        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ data })
      }

      case 'delete': {
        const { id } = params
        const { error } = await sb
          .from('platforms')
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
