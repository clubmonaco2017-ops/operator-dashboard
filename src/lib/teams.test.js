import { describe, it, expect } from 'vitest'
import {
  pluralizeOperators,
  formatLeadRole,
  validateTeamName,
  canEditTeam,
  canManageCuratorship,
  canSeeTeamsNav,
} from './teams.js'

describe('pluralizeOperators', () => {
  it('one form', () => {
    expect(pluralizeOperators(1)).toBe('1 оператор')
    expect(pluralizeOperators(21)).toBe('21 оператор')
  })
  it('few form', () => {
    expect(pluralizeOperators(2)).toBe('2 оператора')
    expect(pluralizeOperators(4)).toBe('4 оператора')
    expect(pluralizeOperators(22)).toBe('22 оператора')
  })
  it('many form', () => {
    expect(pluralizeOperators(0)).toBe('0 операторов')
    expect(pluralizeOperators(5)).toBe('5 операторов')
    expect(pluralizeOperators(11)).toBe('11 операторов')
    expect(pluralizeOperators(25)).toBe('25 операторов')
  })
})

describe('formatLeadRole', () => {
  it('teamlead → Тимлид', () => {
    expect(formatLeadRole('teamlead')).toBe('Тимлид')
  })
  it('moderator → Модератор', () => {
    expect(formatLeadRole('moderator')).toBe('Модератор')
  })
  it('unknown role passes through', () => {
    expect(formatLeadRole('admin')).toBe('admin')
    expect(formatLeadRole('operator')).toBe('operator')
  })
  it('null/undefined → empty string', () => {
    expect(formatLeadRole(null)).toBe('')
    expect(formatLeadRole(undefined)).toBe('')
  })
})

describe('validateTeamName', () => {
  it('valid', () => {
    expect(validateTeamName('Alpha')).toEqual({ valid: true })
    expect(validateTeamName('A')).toEqual({ valid: true })
    expect(validateTeamName('A'.repeat(80))).toEqual({ valid: true }) // boundary
  })
  it('invalid: empty/null', () => {
    expect(validateTeamName('').valid).toBe(false)
    expect(validateTeamName('   ').valid).toBe(false)
    expect(validateTeamName(null).valid).toBe(false)
    expect(validateTeamName(undefined).valid).toBe(false)
  })
  it('invalid: too long', () => {
    expect(validateTeamName('A'.repeat(81)).valid).toBe(false)
  })
})

describe('canEditTeam', () => {
  const team = { id: 1, lead_user_id: 42 }
  it('admin/superadmin — always true', () => {
    expect(canEditTeam({ id: 1, role: 'admin' }, team)).toBe(true)
    expect(canEditTeam({ id: 2, role: 'superadmin' }, team)).toBe(true)
  })
  it('lead of the team — true', () => {
    expect(canEditTeam({ id: 42, role: 'teamlead' }, team)).toBe(true)
    expect(canEditTeam({ id: 42, role: 'moderator' }, team)).toBe(true)
  })
  it('non-lead non-admin — false', () => {
    expect(canEditTeam({ id: 99, role: 'teamlead' }, team)).toBe(false)
    expect(canEditTeam({ id: 99, role: 'operator' }, team)).toBe(false)
  })
  it('null inputs — false', () => {
    expect(canEditTeam(null, team)).toBe(false)
    expect(canEditTeam({ id: 42, role: 'admin' }, null)).toBe(false)
  })
})

describe('canManageCuratorship', () => {
  it('admin/superadmin — always true', () => {
    expect(canManageCuratorship({ id: 1, role: 'admin' }, 50, 60)).toBe(true)
    expect(canManageCuratorship({ id: 2, role: 'superadmin' }, 50, 60)).toBe(true)
  })
  it('current curator — true', () => {
    expect(canManageCuratorship({ id: 50, role: 'moderator' }, 50, 60)).toBe(true)
  })
  it('new moderator — true', () => {
    expect(canManageCuratorship({ id: 60, role: 'moderator' }, 50, 60)).toBe(true)
  })
  it('unrelated user — false', () => {
    expect(canManageCuratorship({ id: 99, role: 'moderator' }, 50, 60)).toBe(false)
    expect(canManageCuratorship({ id: 99, role: 'teamlead' }, 50, 60)).toBe(false)
  })
  it('null user — false', () => {
    expect(canManageCuratorship(null, 50, 60)).toBe(false)
  })
})

describe('canSeeTeamsNav', () => {
  it('admin/superadmin/teamlead/moderator — always visible', () => {
    expect(canSeeTeamsNav({ id: 1, role: 'admin' }, false)).toBe(true)
    expect(canSeeTeamsNav({ id: 1, role: 'superadmin' }, false)).toBe(true)
    expect(canSeeTeamsNav({ id: 1, role: 'teamlead' }, false)).toBe(true)
    expect(canSeeTeamsNav({ id: 1, role: 'moderator' }, false)).toBe(true)
  })
  it('operator with team membership — visible', () => {
    expect(canSeeTeamsNav({ id: 1, role: 'operator' }, true)).toBe(true)
  })
  it('operator without team — hidden', () => {
    expect(canSeeTeamsNav({ id: 1, role: 'operator' }, false)).toBe(false)
  })
  it('unknown role — hidden', () => {
    expect(canSeeTeamsNav({ id: 1, role: 'guest' }, true)).toBe(false)
  })
  it('null user — hidden', () => {
    expect(canSeeTeamsNav(null, true)).toBe(false)
  })
})
