// api/admin/create-staff.js
import { verifyCaller, Unauthorized } from './_auth.js'
import { getSupabaseAdmin } from './_supabase.js'

const REQUIRED_FIELDS = [
  'p_email',
  'p_password',
  'p_role',
  'p_first_name',
  'p_last_name',
]

function send(res, status, payload) {
  return res.status(status).json(payload)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' })
  }

  let caller
  try {
    caller = await verifyCaller(req)
  } catch (e) {
    if (e instanceof Unauthorized) {
      return send(res, 401, { error: e.message })
    }
    return send(res, 500, { error: e.message || 'auth check failed' })
  }
  void caller // permission check is delegated to the RPC

  const body = req.body || {}
  for (const k of REQUIRED_FIELDS) {
    if (body[k] == null || body[k] === '') {
      return send(res, 400, { error: `missing required field: ${k}` })
    }
  }

  const sb = getSupabaseAdmin()

  const { data: createData, error: createErr } = await sb.auth.admin.createUser({
    email: body.p_email,
    password: body.p_password,
    email_confirm: true,
  })

  if (createErr) {
    const msg = createErr.message || ''
    const isCollision =
      createErr.code === 'email_exists' ||
      /already been registered/i.test(msg) ||
      /already registered/i.test(msg)
    if (isCollision) {
      return send(res, 409, { error: 'email already exists' })
    }
    return send(res, 500, { error: `auth-create failed: ${msg}` })
  }

  const authUserId = createData?.user?.id
  if (!authUserId) {
    return send(res, 500, { error: 'auth-create failed: missing user id' })
  }

  const rpcArgs = { ...body, p_auth_user_id: authUserId }
  const { data: rpcData, error: rpcErr } = await sb.rpc('create_staff', rpcArgs)

  if (rpcErr) {
    const { error: delErr } = await sb.auth.admin.deleteUser(authUserId)
    if (delErr) {
      console.error(
        '[create-staff] orphan auth.users (rollback failed):',
        authUserId,
        delErr.message,
      )
    }
    if (rpcErr.code === '42501') {
      return send(res, 403, { error: 'forbidden: insufficient permission' })
    }
    if (rpcErr.code === '23502' || rpcErr.code === '23514') {
      return send(res, 422, { error: rpcErr.message })
    }
    return send(res, 500, { error: `rpc failed: ${rpcErr.message}` })
  }

  return send(res, 200, { data: { id: rpcData } })
}

export const config = { runtime: 'nodejs' }
