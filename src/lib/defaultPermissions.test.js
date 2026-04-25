import { describe, it, expect } from 'vitest'
import { defaultPermissions } from './defaultPermissions.js'

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
})
