import { describe, it, expect } from 'vitest'
import { formatNotificationMessage, targetForNotification } from './notificationMessages.js'

describe('formatNotificationMessage', () => {
  it('formats task_created', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_created',
      actor_name: 'Иван Петров', entity_label: 'Отзвон клиента', payload: {},
    })
    expect(msg).toBe('Иван Петров создал задачу «Отзвон клиента»')
  })

  it('formats task_reassigned', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_reassigned',
      actor_name: 'Анна Смирнова', entity_label: 'Сделать KPI', payload: {},
    })
    expect(msg).toBe('Анна Смирнова переназначила задачу «Сделать KPI»')
  })

  it('formats deadline_changed', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'deadline_changed',
      actor_name: 'Анна', entity_label: 'KPI', payload: {},
    })
    expect(msg).toBe('Анна изменила дедлайн в задаче «KPI»')
  })

  it('formats team member_added', () => {
    const msg = formatNotificationMessage({
      source: 'team_activity', event_type: 'member_added',
      actor_name: 'Бекетов', entity_label: 'Day Shift', payload: {},
    })
    expect(msg).toBe('Бекетов добавил участника в команду «Day Shift»')
  })

  it('formats deletion_request_pending', () => {
    const msg = formatNotificationMessage({
      source: 'deletion_request', event_type: 'deletion_request_pending',
      actor_name: 'Бекетова', entity_label: 'Кузнецов И.И.', payload: {},
    })
    expect(msg).toBe('Запрос на удаление: Кузнецов И.И.')
  })

  it('falls back to generic message for unknown event_type', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'wat',
      actor_name: 'X', entity_label: 'Y', payload: {},
    })
    expect(msg).toBe('X выполнил действие в «Y»')
  })

  it('uses Система when actor_name is null', () => {
    const msg = formatNotificationMessage({
      source: 'task_activity', event_type: 'task_created',
      actor_name: null, entity_label: 'Y', payload: {},
    })
    expect(msg).toBe('Система создала задачу «Y»')
  })
})

describe('targetForNotification', () => {
  it('routes task_activity to /tasks?id=', () => {
    expect(targetForNotification({ source: 'task_activity', entity_id: 42 })).toBe('/tasks?id=42')
  })
  it('routes team_activity to /teams?id=', () => {
    expect(targetForNotification({ source: 'team_activity', entity_id: 7 })).toBe('/teams?id=7')
  })
  it('returns null for deletion_request', () => {
    expect(targetForNotification({ source: 'deletion_request', entity_id: 1 })).toBeNull()
  })
})
