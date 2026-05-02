import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))

import { supabase } from '../supabaseClient'
import {
  useUnreadTasksCount,
  invalidateUnreadTasksCount,
  invalidateAllUnreadTasksCount,
} from './useUnreadTasksCount.js'

beforeEach(() => {
  supabase.rpc.mockReset()
  // Clear module cache between tests
  invalidateAllUnreadTasksCount()
})

describe('useUnreadTasksCount', () => {
  it('fetches count from count_unread_tasks RPC and caches it', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 5, error: null })
    const { result } = renderHook(() => useUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(5))
    expect(supabase.rpc).toHaveBeenCalledWith('count_unread_tasks')

    // Second mount — uses cache, no new RPC call
    supabase.rpc.mockClear()
    const { result: result2 } = renderHook(() => useUnreadTasksCount(42))
    expect(result2.current.count).toBe(5)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidateUnreadTasksCount(userId) clears cache and re-fetches in mounted hooks', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 3, error: null })
    const { result } = renderHook(() => useUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(3))

    supabase.rpc.mockResolvedValueOnce({ data: 7, error: null })
    act(() => invalidateUnreadTasksCount(42))
    await waitFor(() => expect(result.current.count).toBe(7))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('returns 0 and skips fetch when userId is null', () => {
    const { result } = renderHook(() => useUnreadTasksCount(null))
    expect(result.current.count).toBe(0)
    expect(result.current.loading).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
