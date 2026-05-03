// src/components/notifications/PushPromptBanner.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/pushClient.js', () => ({
  enablePush: vi.fn(),
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn().mockResolvedValue({
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
  }),
}))
import { enablePush, getPushState, isIosNonStandalone } from '../../lib/pushClient.js'
import { PushPromptBanner, DISMISSED_KEY } from './PushPromptBanner.jsx'

beforeEach(() => {
  localStorage.clear()
  enablePush.mockReset()
  getPushState.mockReset()
  isIosNonStandalone.mockReset().mockReturnValue(false)
})

describe('PushPromptBanner', () => {
  it('renders when state=default and not dismissed', () => {
    getPushState.mockReturnValue('default')
    render(<PushPromptBanner />)
    expect(screen.getByText(/Получайте уведомления/i)).toBeInTheDocument()
  })

  it('does not render when state=granted', () => {
    getPushState.mockReturnValue('granted')
    const { container } = render(<PushPromptBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when dismissed within 7 days', () => {
    getPushState.mockReturnValue('default')
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    const { container } = render(<PushPromptBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders again when dismissed flag is older than 7 days', () => {
    getPushState.mockReturnValue('default')
    localStorage.setItem(DISMISSED_KEY, String(Date.now() - 8 * 24 * 60 * 60 * 1000))
    render(<PushPromptBanner />)
    expect(screen.getByText(/Получайте уведомления/i)).toBeInTheDocument()
  })

  it('clicking dismiss writes a fresh timestamp and hides', () => {
    getPushState.mockReturnValue('default')
    const { container } = render(<PushPromptBanner />)
    fireEvent.click(screen.getByRole('button', { name: /закрыть/i }))
    expect(localStorage.getItem(DISMISSED_KEY)).toBeTruthy()
    expect(container.firstChild).toBeNull()
  })

  it('clicking enable calls enablePush and hides on success', async () => {
    getPushState.mockReturnValue('default')
    enablePush.mockResolvedValue({ state: 'granted' })
    const { container } = render(<PushPromptBanner />)
    fireEvent.click(screen.getByRole('button', { name: /Включить/i }))
    await waitFor(() => expect(enablePush).toHaveBeenCalled())
  })

  it('renders iOS hint instead of enable button when iosHint is true', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    render(<PushPromptBanner />)
    expect(screen.getByText(/Добавьте.*на главный экран/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Включить$/i })).toBeNull()
  })
})
