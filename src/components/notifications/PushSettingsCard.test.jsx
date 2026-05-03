// src/components/notifications/PushSettingsCard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/pushClient.js', () => ({
  enablePush:   vi.fn(),
  disablePush:  vi.fn(),
  getPushState: vi.fn(),
  isIosNonStandalone: vi.fn(),
  ensureSWRegistered: vi.fn().mockResolvedValue({
    pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
  }),
}))
import { enablePush, disablePush, getPushState, isIosNonStandalone } from '../../lib/pushClient.js'
import { PushSettingsCard } from './PushSettingsCard.jsx'

beforeEach(() => {
  enablePush.mockReset()
  disablePush.mockReset()
  getPushState.mockReset()
  isIosNonStandalone.mockReset().mockReturnValue(false)
})

describe('PushSettingsCard', () => {
  it('renders unsupported message when state is unsupported', () => {
    getPushState.mockReturnValue('unsupported')
    render(<PushSettingsCard />)
    expect(screen.getByText(/не поддерживает push/i)).toBeInTheDocument()
  })

  it('renders enable button when state is default', () => {
    getPushState.mockReturnValue('default')
    render(<PushSettingsCard />)
    expect(screen.getByRole('button', { name: /Включить/i })).toBeInTheDocument()
  })

  it('clicking enable calls enablePush', async () => {
    getPushState.mockReturnValue('default')
    enablePush.mockResolvedValue({ state: 'granted', endpoint: 'x' })
    render(<PushSettingsCard />)
    fireEvent.click(screen.getByRole('button', { name: /Включить/i }))
    await waitFor(() => expect(enablePush).toHaveBeenCalled())
  })

  it('renders disable button when subscribed', async () => {
    getPushState.mockReturnValue('granted')
    const { rerender } = render(<PushSettingsCard />)
    // Force isSubscribed=true via prop trick: re-render with mocked hook value
    // (we test the granted+subscribed branch by mocking ensureSWRegistered to return a subscription)
    const { ensureSWRegistered } = await import('../../lib/pushClient.js')
    ensureSWRegistered.mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'x' }) },
    })
    rerender(<PushSettingsCard />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Отключить/i })).toBeInTheDocument()
    )
  })

  it('shows denied info when permission denied', () => {
    getPushState.mockReturnValue('denied')
    render(<PushSettingsCard />)
    expect(screen.getByText(/Заблокировано в настройках браузера/i)).toBeInTheDocument()
  })

  it('shows iOS hint instead of toggle when iosHint is true', () => {
    getPushState.mockReturnValue('default')
    isIosNonStandalone.mockReturnValue(true)
    render(<PushSettingsCard />)
    expect(screen.getByText(/Добавьте.*на главный экран/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Включить/i })).toBeNull()
  })
})
