import { describe, it, expect } from 'vitest'
import { normalizeProfile } from './useAuth.jsx'

describe('normalizeProfile', () => {
  it('returns null for null input', () => {
    expect(normalizeProfile(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(normalizeProfile(undefined)).toBeNull()
  })

  it('maps get_current_user_profile RPC row to camelCase shape', () => {
    const row = {
      id: 1,
      email: 'a@b.c',
      role: 'admin',
      ref_code: 'ADM-ИванП-001',
      first_name: 'Иван',
      last_name: 'Петров',
      alias: null,
      permissions: ['create_tasks', 'view_all_revenue'],
      attributes: { shift: 'ДЕНЬ' },
      timezone: 'Europe/Kiev',
      is_active: true,
    }
    expect(normalizeProfile(row)).toEqual({
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

  it('returns empty array for permissions when field absent', () => {
    const row = {
      id: 2,
      email: 'x@y.z',
      role: 'operator',
    }
    expect(normalizeProfile(row).permissions).toEqual([])
  })

  it('returns empty array for permissions when field is not an array', () => {
    const row = {
      id: 3,
      email: 'x@y.z',
      role: 'operator',
      permissions: null,
    }
    expect(normalizeProfile(row).permissions).toEqual([])
  })

  it('defaults timezone to Europe/Kiev when missing', () => {
    const row = { id: 4, email: 'x@y.z', role: 'operator' }
    expect(normalizeProfile(row).timezone).toBe('Europe/Kiev')
  })

  it('returns empty attributes object when field missing', () => {
    const row = { id: 5, email: 'x@y.z', role: 'operator' }
    expect(normalizeProfile(row).attributes).toEqual({})
  })

  it('isActive defaults to true when field absent', () => {
    const row = { id: 6, email: 'x@y.z', role: 'operator' }
    expect(normalizeProfile(row).isActive).toBe(true)
  })

  it('isActive is false when explicitly false', () => {
    const row = { id: 7, email: 'x@y.z', role: 'operator', is_active: false }
    expect(normalizeProfile(row).isActive).toBe(false)
  })

  it('maps ref_code to refCode, first_name to firstName, last_name to lastName', () => {
    const row = {
      id: 8,
      email: 'x@y.z',
      role: 'operator',
      ref_code: 'OPR-001',
      first_name: 'Alice',
      last_name: 'Smith',
      alias: 'Ali',
    }
    const result = normalizeProfile(row)
    expect(result.refCode).toBe('OPR-001')
    expect(result.firstName).toBe('Alice')
    expect(result.lastName).toBe('Smith')
    expect(result.alias).toBe('Ali')
  })
})
