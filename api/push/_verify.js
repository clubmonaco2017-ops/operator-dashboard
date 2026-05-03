// api/push/_verify.js
import crypto from 'node:crypto'

export const FIVE_MINUTES_MS = 5 * 60 * 1000

export function verifyWebhook({ rawBody, signature, secret, now }) {
  if (!signature) return { ok: false, reason: 'missing-signature' }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  let sigOk = false
  try {
    sigOk = expected.length === signature.length &&
            crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    sigOk = false
  }
  if (!sigOk) return { ok: false, reason: 'signature' }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload || typeof payload.source !== 'string' || (payload.row_id == null)) {
    return { ok: false, reason: 'missing-fields' }
  }

  const ts = payload.created_at ? Date.parse(payload.created_at) : NaN
  if (!Number.isFinite(ts) || (now - ts) > FIVE_MINUTES_MS || (ts - now) > FIVE_MINUTES_MS) {
    return { ok: false, reason: 'stale' }
  }

  return { ok: true, payload }
}
