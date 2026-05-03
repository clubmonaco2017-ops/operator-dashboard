import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))
vi.mock('./useUnreadTasksCount.js', () => ({
  invalidateUnreadTasksCount: vi.fn(),
}))
vi.mock('./useTaskList.js', () => ({
  invalidateUserTaskList: vi.fn(),
}))

import { supabase } from '../supabaseClient'
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'
import { invalidateUserTaskList } from './useTaskList.js'
import { useTaskRealtimeSync } from './useTaskRealtimeSync.js'

beforeEach(() => {
  supabase.channel.mockReset()
  supabase.removeChannel.mockReset()
  invalidateUnreadTasksCount.mockReset()
  invalidateUserTaskList.mockReset()
})

describe('useTaskRealtimeSync', () => {
  it('subscribes channel with actor_id filter and cleans up on unmount', () => {
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn().mockReturnThis()
    const fakeChannel = { on, subscribe }
    on.mockReturnValue(fakeChannel)
    subscribe.mockReturnValue(fakeChannel)
    supabase.channel.mockReturnValue(fakeChannel)

    const { unmount } = renderHook(() => useTaskRealtimeSync(42))

    expect(supabase.channel).toHaveBeenCalledWith('task-activity-realtime-42')
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'task_activity',
        filter: 'actor_id=neq.42',
      }),
      expect.any(Function),
    )
    expect(subscribe).toHaveBeenCalled()

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledWith(fakeChannel)
  })

  it('invalidates counter + task list on event payload', () => {
    let capturedCallback = null
    const subscribe = vi.fn().mockReturnThis()
    const on = vi.fn((_, __, cb) => {
      capturedCallback = cb
      return { on, subscribe }
    })
    const fakeChannel = { on, subscribe }
    supabase.channel.mockReturnValue(fakeChannel)

    renderHook(() => useTaskRealtimeSync(42))

    expect(capturedCallback).toBeTruthy()
    capturedCallback({ new: { actor_id: 99, task_id: 1 } })

    expect(invalidateUnreadTasksCount).toHaveBeenCalledWith(42)
    expect(invalidateUserTaskList).toHaveBeenCalled()
  })
})
