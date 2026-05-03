import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { channel: vi.fn(), removeChannel: vi.fn() },
}))
vi.mock('./useNotifications.js', () => ({ invalidateUserNotifications: vi.fn() }))
vi.mock('./useNotificationsUnseenCount.js', () => ({
  invalidateNotificationsUnseenCount: vi.fn(),
}))
import { supabase } from '../supabaseClient'
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'
import { useNotificationsRealtimeSync } from './useNotificationsRealtimeSync.js'

beforeEach(() => {
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  invalidateUserNotifications.mockReset()
  invalidateNotificationsUnseenCount.mockReset()
})

describe('useNotificationsRealtimeSync', () => {
  it('subscribes to two channels (team_activity + deletion_requests) and cleans up', () => {
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn().mockReturnThis()
    const fakeChannel = { on, subscribe }
    on.mockReturnValue(fakeChannel)
    subscribe.mockReturnValue(fakeChannel)
    supabase.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useNotificationsRealtimeSync(42))

    expect(supabase.channel).toHaveBeenCalledTimes(2)
    expect(supabase.channel).toHaveBeenCalledWith('team-activity-notifs-42')
    expect(supabase.channel).toHaveBeenCalledWith('deletion-requests-notifs-42')

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledTimes(2)
  })

  it('invalidates notifications + counter on event', () => {
    const callbacks = []
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn((_, __, cb) => {
      callbacks.push(cb)
      return { on, subscribe }
    })
    supabase.channel.mockReturnValue({ on, subscribe })

    renderHook(() => useNotificationsRealtimeSync(42))

    expect(callbacks.length).toBeGreaterThanOrEqual(2)
    callbacks[0]({ new: { actor_id: 99 } })
    expect(invalidateUserNotifications).toHaveBeenCalled()
    expect(invalidateNotificationsUnseenCount).toHaveBeenCalledWith(42)
  })

  it('does nothing when userId is null', () => {
    renderHook(() => useNotificationsRealtimeSync(null))
    expect(supabase.channel).not.toHaveBeenCalled()
  })
})
