import { describe, it, expect } from 'vitest'
import { buildRefCode, roleToPrefix } from './refCode.js'

describe('roleToPrefix', () => {
  it('maps each role to its prefix', () => {
    expect(roleToPrefix('superadmin')).toBe('SA')
    expect(roleToPrefix('admin')).toBe('ADM')
    expect(roleToPrefix('moderator')).toBe('MOD')
    expect(roleToPrefix('teamlead')).toBe('TL')
    expect(roleToPrefix('operator')).toBe('OP')
  })

  it('throws on unknown role', () => {
    expect(() => roleToPrefix('foo')).toThrow()
  })
})

describe('buildRefCode', () => {
  it('builds code for moderator', () => {
    expect(buildRefCode({
      role: 'moderator',
      firstName: 'Иван',
      lastName: 'Петров',
      number: 1,
    })).toBe('MOD-ИванП-001')
  })

  it('builds code for team lead', () => {
    expect(buildRefCode({
      role: 'teamlead',
      firstName: 'Анна',
      lastName: 'Михайлова',
      number: 3,
    })).toBe('TL-АннаМ-003')
  })

  it('builds code for operator with number >= 100', () => {
    expect(buildRefCode({
      role: 'operator',
      firstName: 'Вадим',
      lastName: 'Соловьёв',
      number: 123,
    })).toBe('OP-ВадимС-123')
  })

  it('capitalizes first name and takes first letter of last name', () => {
    expect(buildRefCode({
      role: 'admin',
      firstName: 'пётр',
      lastName: 'сидоров',
      number: 7,
    })).toBe('ADM-ПётрС-007')
  })

  it('throws when number > 999', () => {
    expect(() =>
      buildRefCode({ role: 'admin', firstName: 'А', lastName: 'Б', number: 1000 })
    ).toThrow()
  })
})
