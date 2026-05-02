import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { PlatformBrandingTab } from './PlatformBrandingTab.jsx'
import { platformApi } from '../../lib/platforms.js'

const platform = {
  id: 'p-1',
  name: 'PRIME',
  logo_url: 'https://example.com/logo.png',
  contacts: [{ name: 'Joe', email: 'joe@x.com' }],
  access_login: 'login1',
  access_password: 'pw1',
  notes: 'note1',
}

function renderWithContext(ctxPlatform = platform) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ platform: ctxPlatform, reload: vi.fn() }} />}>
          <Route path="/" element={<PlatformBrandingTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
})

describe('PlatformBrandingTab', () => {
  it('hydrates form fields from outlet context', () => {
    renderWithContext()
    expect(screen.getByLabelText(/Логин/i)).toHaveValue('login1')
    expect(screen.getByPlaceholderText(/Дополнительная информация/i)).toHaveValue('note1')
  })

  it('disables Save when not dirty', () => {
    renderWithContext()
    const btn = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    expect(btn).toBeDisabled()
  })

  it('calls platformApi update with full payload (contacts/name unchanged) on save', async () => {
    platformApi.mockResolvedValueOnce({ data: {}, error: null })
    renderWithContext()
    fireEvent.change(screen.getByLabelText(/Логин/i), { target: { value: 'login2' } })
    const btn = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('update', expect.objectContaining({
        id: 'p-1',
        name: 'PRIME',                  // unchanged from context
        contacts: platform.contacts,     // unchanged from context
        access_login: 'login2',          // new value
      }))
    })
  })
})
