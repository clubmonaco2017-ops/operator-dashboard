// api/push/_verify.test.js
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyWebhook, FIVE_MINUTES_MS } from './_verify.js'

const SECRET = 'test-secret'

function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyWebhook', () => {
  it('returns ok=true for matching HMAC and fresh created_at', () => {
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toMatchObject({ ok: true })
  })

  it('rejects with reason="signature" on bad HMAC', () => {
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: new Date().toISOString() })
    const r = verifyWebhook({ rawBody: body, signature: 'deadbeef', secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects with reason="missing-signature" when header absent', () => {
    const body = '{}'
    const r = verifyWebhook({ rawBody: body, signature: undefined, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'missing-signature' })
  })

  it('rejects with reason="malformed" when JSON parse fails', () => {
    const body = '{not-json'
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects with reason="missing-fields" when source or row_id absent', () => {
    const body = JSON.stringify({ created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'missing-fields' })
  })

  it('rejects with reason="stale" when created_at older than 5 min', () => {
    const stale = new Date(Date.now() - (FIVE_MINUTES_MS + 1000)).toISOString()
    const body = JSON.stringify({ source: 'x', row_id: 1, created_at: stale })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r).toEqual({ ok: false, reason: 'stale' })
  })

  it('returns parsed payload alongside ok=true', () => {
    const body = JSON.stringify({ source: 'task_activity', row_id: 42, created_at: new Date().toISOString() })
    const sig = sign(body)
    const r = verifyWebhook({ rawBody: body, signature: sig, secret: SECRET, now: Date.now() })
    expect(r.ok).toBe(true)
    expect(r.payload).toMatchObject({ source: 'task_activity', row_id: 42 })
  })
})
