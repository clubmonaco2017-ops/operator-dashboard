import { describe, it, expect } from 'vitest'
import { permissionGroups, allKnownPermissions } from './permissionGroups.js'

describe('permissionGroups', () => {
  it('exports at least three categories', () => {
    expect(permissionGroups.length).toBeGreaterThanOrEqual(3)
  })

  it('each group has title and permissions array', () => {
    for (const group of permissionGroups) {
      expect(typeof group.title).toBe('string')
      expect(Array.isArray(group.permissions)).toBe(true)
      for (const perm of group.permissions) {
        expect(typeof perm.key).toBe('string')
        expect(typeof perm.label).toBe('string')
      }
    }
  })

  it('all known permissions appear exactly once across groups', () => {
    const seen = {}
    for (const group of permissionGroups) {
      for (const perm of group.permissions) {
        expect(seen[perm.key]).toBeUndefined()
        seen[perm.key] = true
      }
    }
  })

  it('allKnownPermissions returns flattened unique keys', () => {
    expect(allKnownPermissions().length).toBe(
      permissionGroups.reduce((s, g) => s + g.permissions.length, 0),
    )
    expect(allKnownPermissions()).toContain('create_users')
    expect(allKnownPermissions()).toContain('view_all_revenue')
  })
})
