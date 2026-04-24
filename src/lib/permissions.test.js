import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isSuperadmin,
} from './permissions.js'

const sa = { role: 'superadmin', permissions: [] }
const admin = {
  role: 'admin',
  permissions: ['create_tasks', 'view_all_tasks'],
}
const op = { role: 'operator', permissions: ['view_own_revenue'] }

describe('hasPermission', () => {
  it('returns true when permission is in the array', () => {
    expect(hasPermission(admin, 'create_tasks')).toBe(true)
  })

  it('returns false when permission is missing', () => {
    expect(hasPermission(admin, 'manage_roles')).toBe(false)
  })

  it('returns true for superadmin regardless of array', () => {
    expect(hasPermission(sa, 'literally_anything')).toBe(true)
  })

  it('handles null user', () => {
    expect(hasPermission(null, 'create_tasks')).toBe(false)
  })

  it('handles user without permissions array', () => {
    expect(hasPermission({ role: 'admin' }, 'create_tasks')).toBe(false)
  })
})

describe('hasAnyPermission', () => {
  it('true if user has at least one', () => {
    expect(hasAnyPermission(admin, ['manage_roles', 'create_tasks'])).toBe(true)
  })

  it('false if user has none', () => {
    expect(hasAnyPermission(op, ['create_tasks', 'manage_roles'])).toBe(false)
  })

  it('superadmin always true', () => {
    expect(hasAnyPermission(sa, ['foo', 'bar'])).toBe(true)
  })
})

describe('hasAllPermissions', () => {
  it('true only if all present', () => {
    expect(hasAllPermissions(admin, ['create_tasks', 'view_all_tasks'])).toBe(true)
    expect(hasAllPermissions(admin, ['create_tasks', 'manage_roles'])).toBe(false)
  })

  it('superadmin always true', () => {
    expect(hasAllPermissions(sa, ['anything', 'else'])).toBe(true)
  })
})

describe('isSuperadmin', () => {
  it('checks role', () => {
    expect(isSuperadmin(sa)).toBe(true)
    expect(isSuperadmin(admin)).toBe(false)
    expect(isSuperadmin(null)).toBe(false)
  })
})
