import { getSupabaseAdmin } from './_supabase.js'
import { randomUUID } from 'crypto'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { caller_id, file, filename, content_type } = req.body || {}
    if (!caller_id) return res.status(401).json({ error: 'Unauthorized' })
    if (!file) return res.status(400).json({ error: 'No file provided' })

    const sb = getSupabaseAdmin()
    const ext = (filename || 'logo.png').split('.').pop()
    const path = `${randomUUID()}.${ext}`

    const buffer = Buffer.from(file, 'base64')

    const { error } = await sb.storage
      .from('logos')
      .upload(path, buffer, { contentType: content_type || 'image/png', upsert: false })

    if (error) return res.status(500).json({ error: error.message })

    const { data: urlData } = sb.storage.from('logos').getPublicUrl(path)

    return res.status(200).json({ data: { url: urlData.publicUrl } })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
