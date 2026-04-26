import { describe, it, expect } from 'vitest'
import { defaultPermissions } from './defaultPermissions.js'
import { hasPermission } from './permissions.js'

describe('defaultPermissions', () => {
  it('returns admin defaults', () => {
    expect(defaultPermissions('admin')).toEqual([
      'create_tasks',
      'manage_teams',
      'send_reminders',
      'view_all_revenue',
      'view_all_tasks',
      'manage_clients',
      'assign_team_clients',
    ])
  })

  it('returns moderator defaults', () => {
    expect(defaultPermissions('moderator')).toEqual([
      'create_tasks',
      'manage_teams',
      'view_own_tasks',
      'view_team_revenue',
    ])
  })

  it('returns teamlead defaults', () => {
    expect(defaultPermissions('teamlead')).toEqual([
      'create_tasks',
      'manage_teams',
      'view_own_tasks',
      'view_team_revenue',
    ])
  })

  it('returns operator defaults', () => {
    expect(defaultPermissions('operator')).toEqual([
      'view_own_revenue',
      'view_own_tasks',
    ])
  })

  it('returns empty array for unknown role', () => {
    expect(defaultPermissions('unknown')).toEqual([])
  })

  describe('manage_teams distribution across roles', () => {
    it('includes manage_teams for admin', () => {
      expect(defaultPermissions('admin')).toContain('manage_teams')
    })

    it('includes manage_teams for teamlead', () => {
      expect(defaultPermissions('teamlead')).toContain('manage_teams')
    })

    it('includes manage_teams for moderator', () => {
      expect(defaultPermissions('moderator')).toContain('manage_teams')
    })

    it('does NOT include manage_teams for operator', () => {
      expect(defaultPermissions('operator')).not.toContain('manage_teams')
    })
  })

  describe('tasks permissions distribution across roles', () => {
    it('admin has create_tasks AND view_all_tasks', () => {
      const perms = defaultPermissions('admin')
      expect(perms).toContain('create_tasks')
      expect(perms).toContain('view_all_tasks')
    })

    it('superadmin effectively has create_tasks AND view_all_tasks (bypasses defaults via isSuperadmin)', () => {
      // superadmin намеренно отсутствует в DEFAULTS — hasPermission()
      // короткозамыкает true для роли через isSuperadmin().
      const sa = { role: 'superadmin', permissions: defaultPermissions('superadmin') }
      expect(hasPermission(sa, 'create_tasks')).toBe(true)
      expect(hasPermission(sa, 'view_all_tasks')).toBe(true)
    })

    it('teamlead has create_tasks AND view_own_tasks but NOT view_all_tasks', () => {
      const perms = defaultPermissions('teamlead')
      expect(perms).toContain('create_tasks')
      expect(perms).toContain('view_own_tasks')
      expect(perms).not.toContain('view_all_tasks')
    })

    it('moderator has create_tasks AND view_own_tasks but NOT view_all_tasks', () => {
      const perms = defaultPermissions('moderator')
      expect(perms).toContain('create_tasks')
      expect(perms).toContain('view_own_tasks')
      expect(perms).not.toContain('view_all_tasks')
    })

    it('operator has view_own_tasks but NOT create_tasks NOR view_all_tasks', () => {
      const perms = defaultPermissions('operator')
      expect(perms).toContain('view_own_tasks')
      expect(perms).not.toContain('create_tasks')
      expect(perms).not.toContain('view_all_tasks')
    })
  })
})
