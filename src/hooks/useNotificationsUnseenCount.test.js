import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))
import { supabase } from '../supabaseClient'
import {
  useNotificationsUnseenCount,
  invalidateNotificationsUnseenCount,
  invalidateAllNotificationsUnseenCount,
} from './useNotificationsUnseenCount.js'

beforeEach(() => {
  supabase.rpc.mockReset()
  invalidateAllNotificationsUnseenCount()
})

describe('useNotificationsUnseenCount', () => {
  it('fetches via count_user_notifications_unseen RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: 3, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(3))
    expect(supabase.rpc).toHaveBeenCalledWith('count_user_notifications_unseen')
  })

  it('returns 0 when userId null', () => {
    const { result } = renderHook(() => useNotificationsUnseenCount(null))
    expect(result.current).toBe(0)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidate triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: 1, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(1))

    supabase.rpc.mockResolvedValue({ data: 5, error: null })
    act(() => invalidateNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(5))
  })

  it('invalidateAll triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: 2, error: null })
    const { result } = renderHook(() => useNotificationsUnseenCount(42))
    await waitFor(() => expect(result.current).toBe(2))

    supabase.rpc.mockResolvedValue({ data: 7, error: null })
    act(() => invalidateAllNotificationsUnseenCount())
    await waitFor(() => expect(result.current).toBe(7))
  })
})
