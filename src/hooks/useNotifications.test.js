import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../supabaseClient', () => ({
  supabase: { rpc: vi.fn() },
}))
import { supabase } from '../supabaseClient'
import { useNotifications, invalidateUserNotifications } from './useNotifications.js'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('useNotifications', () => {
  it('fetches via list_user_notifications RPC', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'task_activity:1' }], error: null })
    const { result } = renderHook(() => useNotifications(42))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('list_user_notifications', { p_limit: 50 })
    expect(result.current.rows).toEqual([{ id: 'task_activity:1' }])
  })

  it('returns empty when userId null', () => {
    const { result } = renderHook(() => useNotifications(null))
    expect(result.current.rows).toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('invalidateUserNotifications triggers re-fetch', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useNotifications(42))
    await waitFor(() => expect(result.current.loading).toBe(false))

    supabase.rpc.mockClear()
    supabase.rpc.mockResolvedValue({ data: [{ id: 'new' }], error: null })
    act(() => invalidateUserNotifications())
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 'new' }]))
  })
})
