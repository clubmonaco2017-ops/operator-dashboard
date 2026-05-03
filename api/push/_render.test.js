// api/push/_render.test.js
import { describe, it, expect } from 'vitest'
import { renderPushPayload } from './_render.js'

describe('renderPushPayload', () => {
  it('renders task_activity into title/body/url/tag', () => {
    const ev = {
      source: 'task_activity',
      entity_id: 7,
      entity_label: 'Купить молоко',
      actor_name: 'Анна Смирнова',
      event_type: 'task_created',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 12345)
    expect(r).toEqual({
      title: 'Купить молоко',
      body: 'Анна Смирнова создала задачу «Купить молоко»',
      url: '/tasks?id=7',
      tag: 'task_activity:12345',
    })
  })

  it('renders team_activity', () => {
    const ev = {
      source: 'team_activity',
      entity_id: 4,
      entity_label: 'Команда Альфа',
      actor_name: 'Иван',
      event_type: 'member_added',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 99)
    expect(r.title).toBe('Команда Альфа')
    expect(r.body).toBe('Иван добавил участника в команду «Команда Альфа»')
    expect(r.url).toBe('/teams?id=4')
    expect(r.tag).toBe('team_activity:99')
  })

  it('renders staff_activity (target user)', () => {
    const ev = {
      source: 'staff_activity',
      entity_id: 11,
      entity_label: 'Пётр Иванов',
      actor_name: 'Анна',
      event_type: 'curator_assigned',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 5)
    expect(r.title).toBe('Пётр Иванов')
    expect(r.body).toBe('Анна назначила куратора для Пётр Иванов')
    expect(r.url).toBe('/staff')
    expect(r.tag).toBe('staff_activity:5')
  })

  it('renders deletion_request with placeholder url', () => {
    const ev = {
      source: 'deletion_request',
      entity_id: 17,
      entity_label: 'Алексей Петров',
      actor_name: 'Анна',
      event_type: 'deletion_request_pending',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 17)
    expect(r.title).toBe('Запрос на удаление')
    expect(r.body).toContain('Алексей Петров')
    expect(r.url).toBe('/admin/agencies')
    expect(r.tag).toBe('deletion_request:17')
  })

  it('falls back to /notifications when source maps to no deep link', () => {
    const ev = {
      source: 'unknown',
      entity_id: 1,
      entity_label: 'X',
      actor_name: 'Y',
      event_type: 'noop',
      payload: {},
      created_at: '2026-05-03T10:00:00Z',
    }
    const r = renderPushPayload(ev, 1)
    expect(r.url).toBe('/notifications')
  })
})
