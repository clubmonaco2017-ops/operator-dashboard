import { describe, it, expect } from 'vitest'
import {
  pluralizeTasks,
  formatDeadlineRelative,
  computeEffectiveStatus,
  canEditTask,
  canTakeInProgress,
  canSubmitReport,
  canCancelTask,
  canDeleteTask,
  validateTaskTitle,
  validateReport,
} from './tasks.js'

describe('pluralizeTasks', () => {
  it('one form', () => {
    expect(pluralizeTasks(1)).toBe('1 задача')
    expect(pluralizeTasks(21)).toBe('21 задача')
    expect(pluralizeTasks(101)).toBe('101 задача')
  })
  it('few form', () => {
    expect(pluralizeTasks(2)).toBe('2 задачи')
    expect(pluralizeTasks(3)).toBe('3 задачи')
    expect(pluralizeTasks(4)).toBe('4 задачи')
    expect(pluralizeTasks(22)).toBe('22 задачи')
  })
  it('many form', () => {
    expect(pluralizeTasks(0)).toBe('0 задач')
    expect(pluralizeTasks(5)).toBe('5 задач')
    expect(pluralizeTasks(11)).toBe('11 задач')
    expect(pluralizeTasks(15)).toBe('15 задач')
    expect(pluralizeTasks(25)).toBe('25 задач')
  })
})

describe('formatDeadlineRelative', () => {
  const now = new Date('2026-04-25T12:00:00')

  it('null/empty/invalid → empty string', () => {
    expect(formatDeadlineRelative(null, now)).toBe('')
    expect(formatDeadlineRelative(undefined, now)).toBe('')
    expect(formatDeadlineRelative('', now)).toBe('')
    expect(formatDeadlineRelative('not-a-date', now)).toBe('')
  })

  it('today → "сегодня в HH:mm"', () => {
    const d = new Date('2026-04-25T14:05:00')
    expect(formatDeadlineRelative(d, now)).toBe('сегодня в 14:05')
  })

  it('tomorrow → "завтра"', () => {
    const d = new Date('2026-04-26T14:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('завтра')
  })

  it('overdue 1 day (one form)', () => {
    // 23ч в прошлом → floor(-23/24) = -1 → "просрочено 1 день"
    const d = new Date('2026-04-24T13:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('просрочено 1 день')
  })

  it('overdue 5 days', () => {
    // floor(-119/24) = -5 → 5 дней
    const d = new Date('2026-04-20T13:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('просрочено 5 дней')
  })

  it('overdue 2 days (few form)', () => {
    // floor(-47/24) = -2 → 2 дня
    const d = new Date('2026-04-23T13:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('просрочено 2 дня')
  })

  it('in 7 days', () => {
    const d = new Date('2026-05-02T14:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('через 7 дней')
  })

  it('in 2 days (few form)', () => {
    const d = new Date('2026-04-27T14:00:00')
    expect(formatDeadlineRelative(d, now)).toBe('через 2 дня')
  })
})

describe('computeEffectiveStatus', () => {
  const now = new Date('2026-04-25T12:00:00')
  const past = '2026-04-20T10:00:00'
  const future = '2026-05-01T10:00:00'

  it('null task → null', () => {
    expect(computeEffectiveStatus(null, now)).toBe(null)
    expect(computeEffectiveStatus(undefined, now)).toBe(null)
  })

  it('pending past deadline → overdue', () => {
    expect(computeEffectiveStatus({ status: 'pending', deadline: past }, now)).toBe('overdue')
  })

  it('in_progress past deadline → overdue', () => {
    expect(computeEffectiveStatus({ status: 'in_progress', deadline: past }, now)).toBe('overdue')
  })

  it('done past deadline → done (NOT overdue)', () => {
    expect(computeEffectiveStatus({ status: 'done', deadline: past }, now)).toBe('done')
  })

  it('cancelled past deadline → cancelled', () => {
    expect(computeEffectiveStatus({ status: 'cancelled', deadline: past }, now)).toBe('cancelled')
  })

  it('future deadline → status as-is', () => {
    expect(computeEffectiveStatus({ status: 'pending', deadline: future }, now)).toBe('pending')
    expect(computeEffectiveStatus({ status: 'in_progress', deadline: future }, now)).toBe(
      'in_progress',
    )
  })

  it('null deadline → status as-is', () => {
    expect(computeEffectiveStatus({ status: 'pending', deadline: null }, now)).toBe('pending')
  })
})

describe('canEditTask', () => {
  const task = { id: 1, created_by: 42, status: 'pending' }
  it('admin/superadmin → true', () => {
    expect(canEditTask({ id: 1, role: 'admin' }, task)).toBe(true)
    expect(canEditTask({ id: 2, role: 'superadmin' }, task)).toBe(true)
  })
  it('creator → true', () => {
    expect(canEditTask({ id: 42, role: 'operator' }, task)).toBe(true)
  })
  it('non-creator non-admin → false', () => {
    expect(canEditTask({ id: 99, role: 'operator' }, task)).toBe(false)
    expect(canEditTask({ id: 99, role: 'teamlead' }, task)).toBe(false)
  })
  it('null inputs → false', () => {
    expect(canEditTask(null, task)).toBe(false)
    expect(canEditTask({ id: 42, role: 'admin' }, null)).toBe(false)
  })
})

describe('canTakeInProgress', () => {
  it('assignee + pending → true', () => {
    expect(canTakeInProgress({ id: 5 }, { assigned_to: 5, status: 'pending' })).toBe(true)
  })
  it('assignee + in_progress → false', () => {
    expect(canTakeInProgress({ id: 5 }, { assigned_to: 5, status: 'in_progress' })).toBe(false)
  })
  it('not assignee → false', () => {
    expect(canTakeInProgress({ id: 5 }, { assigned_to: 7, status: 'pending' })).toBe(false)
  })
  it('null inputs → false', () => {
    expect(canTakeInProgress(null, { assigned_to: 5, status: 'pending' })).toBe(false)
    expect(canTakeInProgress({ id: 5 }, null)).toBe(false)
  })
})

describe('canSubmitReport', () => {
  it('assignee + in_progress → true', () => {
    expect(canSubmitReport({ id: 5 }, { assigned_to: 5, status: 'in_progress' })).toBe(true)
  })
  it('assignee + pending → false', () => {
    expect(canSubmitReport({ id: 5 }, { assigned_to: 5, status: 'pending' })).toBe(false)
  })
  it('not assignee → false', () => {
    expect(canSubmitReport({ id: 5 }, { assigned_to: 7, status: 'in_progress' })).toBe(false)
  })
  it('null inputs → false', () => {
    expect(canSubmitReport(null, { assigned_to: 5, status: 'in_progress' })).toBe(false)
    expect(canSubmitReport({ id: 5 }, null)).toBe(false)
  })
})

describe('canCancelTask', () => {
  it('admin + active → true', () => {
    expect(canCancelTask({ id: 1, role: 'admin' }, { created_by: 42, status: 'pending' })).toBe(
      true,
    )
    expect(
      canCancelTask({ id: 1, role: 'superadmin' }, { created_by: 42, status: 'in_progress' }),
    ).toBe(true)
  })
  it('admin + done → false', () => {
    expect(canCancelTask({ id: 1, role: 'admin' }, { created_by: 42, status: 'done' })).toBe(false)
  })
  it('creator + active → true', () => {
    expect(
      canCancelTask({ id: 42, role: 'operator' }, { created_by: 42, status: 'pending' }),
    ).toBe(true)
  })
  it('creator + cancelled → false', () => {
    expect(
      canCancelTask({ id: 42, role: 'operator' }, { created_by: 42, status: 'cancelled' }),
    ).toBe(false)
  })
  it('non-creator non-admin → false', () => {
    expect(
      canCancelTask({ id: 99, role: 'operator' }, { created_by: 42, status: 'pending' }),
    ).toBe(false)
  })
  it('null inputs → false', () => {
    expect(canCancelTask(null, { created_by: 42, status: 'pending' })).toBe(false)
    expect(canCancelTask({ id: 1, role: 'admin' }, null)).toBe(false)
  })
})

describe('canDeleteTask', () => {
  it('admin/superadmin → true', () => {
    expect(canDeleteTask({ role: 'admin' })).toBe(true)
    expect(canDeleteTask({ role: 'superadmin' })).toBe(true)
  })
  it('other roles → false', () => {
    expect(canDeleteTask({ role: 'operator' })).toBe(false)
    expect(canDeleteTask({ role: 'teamlead' })).toBe(false)
    expect(canDeleteTask({ role: 'moderator' })).toBe(false)
  })
  it('null user → false', () => {
    expect(canDeleteTask(null)).toBe(false)
    expect(canDeleteTask(undefined)).toBe(false)
  })
})

describe('validateTaskTitle', () => {
  it('valid', () => {
    expect(validateTaskTitle('Task').valid).toBe(true)
    expect(validateTaskTitle('A')).toEqual({ valid: true })
    expect(validateTaskTitle('A'.repeat(200))).toEqual({ valid: true })
  })
  it('invalid: empty/null/whitespace', () => {
    expect(validateTaskTitle('').valid).toBe(false)
    expect(validateTaskTitle('   ').valid).toBe(false)
    expect(validateTaskTitle(null).valid).toBe(false)
    expect(validateTaskTitle(undefined).valid).toBe(false)
  })
  it('invalid: too long (>200)', () => {
    expect(validateTaskTitle('A'.repeat(201)).valid).toBe(false)
  })
})

describe('validateReport', () => {
  it('empty content + empty media → fail', () => {
    expect(validateReport('', []).valid).toBe(false)
    expect(validateReport(null, null).valid).toBe(false)
    expect(validateReport('   ', []).valid).toBe(false)
  })
  it('non-empty content → ok', () => {
    expect(validateReport('Готово', []).valid).toBe(true)
    expect(validateReport('Готово', null).valid).toBe(true)
  })
  it('empty content + non-empty media → ok', () => {
    expect(validateReport('', [{ path: 'a.jpg' }]).valid).toBe(true)
    expect(validateReport(null, [{ path: 'a.jpg' }, { path: 'b.jpg' }]).valid).toBe(true)
  })
})
