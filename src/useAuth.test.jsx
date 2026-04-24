import { describe, it, expect } from 'vitest'
import { normalizeSession } from './useAuth.jsx'

describe('normalizeSession', () => {
  it('returns null for null input', () => {
    expect(normalizeSession(null)).toBeNull()
  })

  it('maps RPC row with new fields (array permissions)', () => {
    const row = {
      user_id: 1,
      user_email: 'a@b.c',
      user_role: 'admin',
      user_ref_code: 'ADM-ИванП-001',
      user_first_name: 'Иван',
      user_last_name: 'Петров',
      user_alias: null,
      user_permissions: { can_view_revenue: true },
      user_permission_names: ['create_tasks', 'view_all_revenue'],
      user_attributes: { shift: 'ДЕНЬ' },
      user_timezone: 'Europe/Kiev',
      user_is_active: true,
    }
    expect(normalizeSession(row)).toEqual({
      id: 1,
      email: 'a@b.c',
      role: 'admin',
      refCode: 'ADM-ИванП-001',
      firstName: 'Иван',
      lastName: 'Петров',
      alias: null,
      permissions: ['create_tasks', 'view_all_revenue'],
      attributes: { shift: 'ДЕНЬ' },
      timezone: 'Europe/Kiev',
      isActive: true,
    })
  })

  it('prefers user_permission_names over user_permissions when both present', () => {
    const row = {
      user_id: 2,
      user_email: 'x@y.z',
      user_role: 'admin',
      user_permissions: { can_view_revenue: true, can_view_chart: false },
      user_permission_names: ['view_all_tasks'],
    }
    expect(normalizeSession(row).permissions).toEqual(['view_all_tasks'])
  })

  it('falls back to legacy jsonb permissions when user_permission_names missing', () => {
    const row = {
      user_id: 3,
      user_email: 'x@y.z',
      user_role: 'operator',
      user_permissions: { can_view_revenue: true, can_view_chart: false },
    }
    expect(normalizeSession(row).permissions).toEqual(['can_view_revenue'])
  })

  it('returns empty array for permissions when neither field present', () => {
    const row = {
      user_id: 4,
      user_email: 'x@y.z',
      user_role: 'operator',
    }
    expect(normalizeSession(row).permissions).toEqual([])
  })

  it('defaults timezone to Europe/Kiev when missing', () => {
    const row = { user_id: 5, user_email: 'x@y.z', user_role: 'operator' }
    expect(normalizeSession(row).timezone).toBe('Europe/Kiev')
  })

  it('returns empty attributes object when user_attributes missing', () => {
    const row = { user_id: 6, user_email: 'x@y.z', user_role: 'operator' }
    expect(normalizeSession(row).attributes).toEqual({})
  })

  it('isActive defaults to true when field absent', () => {
    const row = { user_id: 7, user_email: 'x@y.z', user_role: 'operator' }
    expect(normalizeSession(row).isActive).toBe(true)
  })

  it('isActive is false when explicitly false', () => {
    const row = { user_id: 8, user_email: 'x@y.z', user_role: 'operator', user_is_active: false }
    expect(normalizeSession(row).isActive).toBe(false)
  })
})
