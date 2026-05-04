// api/admin/create-staff.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mocks for the two collaborators imported by the handler.
const mockVerifyCaller = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('./_auth.js', () => ({
  verifyCaller: (...args) => mockVerifyCaller(...args),
  Unauthorized: class Unauthorized extends Error {
    constructor(msg) { super(msg); this.status = 401 }
  },
}))

vi.mock('./_supabase.js', () => ({
  // Service-role admin client: only auth.admin.* in this handler.
  getSupabaseAdmin: () => ({
    auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
  }),
}))

// JWT-bound user client: createClient is called inline in the handler to
// run the RPC under the caller's identity (so current_dashboard_user_id()
// resolves correctly inside the RPC).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}))

// Import AFTER mocks so the module picks them up.
const { default: handler } = await import('./create-staff.js')

function makeReq({ method = 'POST', body = {}, headers = { authorization: 'Bearer t' } } = {}) {
  return { method, body, headers }
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.body = payload; return this },
  }
  return res
}

const VALID_BODY = {
  p_email: 'new@example.com',
  p_password: 'Test123!',
  p_role: 'operator',
  p_first_name: 'New',
  p_last_name: 'User',
  p_alias: null,
  p_permissions: [],
  p_agency_id: '00000000-0000-0000-0000-000000000001',
  p_admin_agency_ids: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyCaller.mockResolvedValue({ callerId: 1, role: 'admin' })
})

describe('POST /api/admin/create-staff', () => {
  it('creates auth user, calls RPC with p_auth_user_id, returns 200 + { data: { id } }', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-1' } }, error: null })
    mockRpc.mockResolvedValue({ data: 42, error: null })

    const req = makeReq({ body: VALID_BODY })
    const res = makeRes()
    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ data: { id: 42 } })
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'Test123!',
      email_confirm: true,
    })
    expect(mockRpc).toHaveBeenCalledWith('create_staff', {
      ...VALID_BODY,
      p_auth_user_id: 'auth-uuid-1',
    })
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('returns 405 for non-POST', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 401 when verifyCaller throws Unauthorized', async () => {
    const { Unauthorized } = await import('./_auth.js')
    mockVerifyCaller.mockRejectedValue(new Unauthorized('invalid JWT'))
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'invalid JWT' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('returns 409 when auth.admin.createUser reports email collision', async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    })
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'email already exists' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('returns 500 when auth.admin.createUser fails for other reason', async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: 'network down' },
    })
    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'auth-create failed: network down' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rolls back auth user and returns 403 when RPC raises 42501', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-2' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'caller 1 lacks create_users', code: '42501' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(403)
    expect(res.body).toEqual({ error: 'forbidden: insufficient permission' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-2')
  })

  it('rolls back auth user and returns 422 when RPC raises 23502 (missing agency)', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-3' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'agency_id is required for role operator', code: '23502' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(422)
    expect(res.body).toEqual({ error: 'agency_id is required for role operator' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-3')
  })

  it('rolls back auth user and returns 500 for unmapped RPC error', async () => {
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-4' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'something broke', code: 'XX000' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'rpc failed: something broke' })
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-uuid-4')
  })

  it('logs orphan when RPC fails AND deleteUser also fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-uuid-5' } }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'broken', code: 'XX000' } })
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'auth api down' } })

    const res = makeRes()
    await handler(makeReq({ body: VALID_BODY }), res)
    expect(res.statusCode).toBe(500)
    expect(errorSpy).toHaveBeenCalledWith(
      '[create-staff] orphan auth.users (rollback failed):',
      'auth-uuid-5',
      'auth api down',
    )
    errorSpy.mockRestore()
  })

  it('returns 400 for missing required fields', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { p_email: 'a@b.c' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/missing/i)
    expect(mockCreateUser).not.toHaveBeenCalled()
  })
})
