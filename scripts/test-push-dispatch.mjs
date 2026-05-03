// scripts/test-push-dispatch.mjs
//
// Sends a synthetic push event to /api/push/dispatch with a valid HMAC
// signature. Reads PUSH_WEBHOOK_SECRET from environment.
//
// Usage:
//   PUSH_WEBHOOK_SECRET=$(grep ^PUSH_WEBHOOK_SECRET .env.local | cut -d= -f2) \
//     node scripts/test-push-dispatch.mjs https://<host>/api/push/dispatch
//
// The source/row_id pair must reference a real existing event for the
// dispatcher to find recipients. Adjust to taste.

import crypto from 'node:crypto'

const url = process.argv[2]
if (!url) { console.error('Usage: node scripts/test-push-dispatch.mjs <url>'); process.exit(2) }
const secret = process.env.PUSH_WEBHOOK_SECRET
if (!secret) { console.error('PUSH_WEBHOOK_SECRET is required'); process.exit(2) }

const body = JSON.stringify({
  source: process.env.SOURCE || 'task_activity',
  row_id: Number(process.env.ROW_ID || 1),
  created_at: new Date().toISOString(),
})
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')

const r = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Push-Signature': sig },
  body,
})
console.log('Status:', r.status)
console.log('Body:  ', await r.text())
