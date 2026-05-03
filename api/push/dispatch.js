// api/push/dispatch.js
import webpush from 'web-push'
import { getSupabaseAdmin } from '../admin/_supabase.js'
import { verifyWebhook } from './_verify.js'
import { renderPushPayload } from './_render.js'

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'admin@example.com'),
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

async function readRawBody(req) {
  if (typeof req.text === 'function') return await req.text()
  return await new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function send(res, status, json) {
  if (res && typeof res.status === 'function') {
    return res.status(status).json(json)
  }
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })

  const rawBody = await readRawBody(req)
  const signature = req.headers?.['x-push-signature'] || req.headers?.get?.('x-push-signature')
  const verdict = verifyWebhook({
    rawBody,
    signature,
    secret: process.env.PUSH_WEBHOOK_SECRET,
    now: Date.now(),
  })
  if (!verdict.ok) {
    const status = verdict.reason === 'malformed' || verdict.reason === 'missing-fields' ? 400 : 401
    return send(res, status, { error: verdict.reason })
  }

  const { source, row_id } = verdict.payload
  const sb = getSupabaseAdmin()

  const [{ data: recipients, error: recErr }, { data: eventRows, error: evErr }] = await Promise.all([
    sb.rpc('list_push_recipients', { p_source: source, p_row_id: row_id }),
    sb.rpc('get_push_event_data', { p_source: source, p_row_id: row_id }),
  ])
  if (recErr) return send(res, 500, { error: 'recipients lookup failed: ' + recErr.message })
  if (evErr) return send(res, 500, { error: 'event lookup failed: ' + evErr.message })

  const eventData = Array.isArray(eventRows) ? eventRows[0] : eventRows
  if (!eventData) return send(res, 200, { sent: 0, reason: 'event-deleted' })
  if (!recipients?.length) return send(res, 200, { sent: 0 })

  const payload = renderPushPayload(eventData, row_id)
  const payloadJson = JSON.stringify(payload)

  const results = await Promise.allSettled(
    recipients.map((r) =>
      webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        payloadJson,
        { TTL: 60 * 60 * 24 },
      ),
    ),
  )

  const dead = []
  let sent = 0
  results.forEach((res2, i) => {
    if (res2.status === 'fulfilled') sent += 1
    else if (res2.reason && [404, 410].includes(res2.reason.statusCode)) {
      dead.push(recipients[i].endpoint)
    }
  })

  if (dead.length) {
    await sb.rpc('disable_push_subscriptions_bulk', { p_endpoints: dead })
  }

  return send(res, 200, {
    sent,
    failed: results.length - sent,
    pruned: dead.length,
  })
}

export const config = { runtime: 'nodejs' }
