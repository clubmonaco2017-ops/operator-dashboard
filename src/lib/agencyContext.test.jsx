import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AgencyProvider, useAgencyContext } from './agencyContext.jsx'

vi.mock('../useAuth.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', availableAgencies: window.__agencies__ ?? [] },
    loading: false,
  }),
}))

const wrapper = ({ children }) => <AgencyProvider>{children}</AgencyProvider>

describe('AgencyContext', () => {
  beforeEach(() => {
    localStorage.clear()
    window.__agencies__ = []
  })

  it('returns empty available list and null active when user has no agencies', () => {
    window.__agencies__ = []
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.availableAgencies).toEqual([])
    expect(result.current.activeAgencyId).toBeNull()
    expect(result.current.isMultiAgency).toBe(false)
  })

  it('auto-selects single agency without showing switcher', () => {
    window.__agencies__ = [{ id: 'a1', name: 'Agency 1' }]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.activeAgencyId).toBe('a1')
    expect(result.current.isMultiAgency).toBe(false)
  })

  it('marks multi-agency when user has 2+ agencies and persists choice', () => {
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.isMultiAgency).toBe(true)
    expect(result.current.activeAgencyId).toBe('a1') // first

    act(() => result.current.setActiveAgency('a2'))
    expect(result.current.activeAgencyId).toBe('a2')
    expect(localStorage.getItem('activeAgencyId')).toBe('a2')
  })

  it('restores activeAgencyId from localStorage if still in available list', () => {
    localStorage.setItem('activeAgencyId', 'a2')
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.activeAgencyId).toBe('a2')
  })

  it('falls back to first when localStorage value is no longer available', () => {
    localStorage.setItem('activeAgencyId', 'stale')
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.activeAgencyId).toBe('a1')
    expect(localStorage.getItem('activeAgencyId')).toBe('a1')
  })

  it('exposes activeAgency object matching activeAgencyId', () => {
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    expect(result.current.activeAgency).toEqual({ id: 'a1', name: 'A' })
  })

  it('setActiveAgency ignores ids not in available list', () => {
    window.__agencies__ = [
      { id: 'a1', name: 'A' },
      { id: 'a2', name: 'B' },
    ]
    const { result } = renderHook(() => useAgencyContext(), { wrapper })
    act(() => result.current.setActiveAgency('not-real'))
    expect(result.current.activeAgencyId).toBe('a1')
  })
})
