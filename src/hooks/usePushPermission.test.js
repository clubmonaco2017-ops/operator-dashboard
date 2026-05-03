// src/hooks/usePushPermission.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../lib/pushClient.js', () => ({
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn(),
}))
import { getPushState, isIosNonStandalone, ensureSWRegistered } from '../lib/pushClient.js'
import { usePushPermission } from './usePushPermission.js'

describe('usePushPermission', () => {
  beforeEach(() => {
    getPushState.mockReset()
    isIosNonStandalone.mockReset().mockReturnValue(false)
    ensureSWRegistered.mockReset().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    })
  })

  it('reports unsupported state', () => {
    getPushState.mockReturnValue('unsupported')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('unsupported')
    expect(result.current.supported).toBe(false)
  })

  it('reports default state', () => {
    getPushState.mockReturnValue('default')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('default')
    expect(result.current.supported).toBe(true)
  })

  it('flags iosHint when iOS non-standalone', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.iosHint).toBe(true)
  })

  it('isSubscribed is true when getSubscription resolves to an object', async () => {
    getPushState.mockReturnValue('granted')
    ensureSWRegistered.mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x.test' }),
      },
    })
    const { result } = renderHook(() => usePushPermission())
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(result.current.isSubscribed).toBe(true)
  })

  it('refresh() re-reads state', () => {
    getPushState.mockReturnValueOnce('default').mockReturnValueOnce('granted')
    const { result } = renderHook(() => usePushPermission())
    expect(result.current.state).toBe('default')
    act(() => result.current.refresh())
    expect(result.current.state).toBe('granted')
  })
})
