import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { PlatformContactsTab } from './PlatformContactsTab.jsx'
import { platformApi } from '../../lib/platforms.js'

const platformWithOne = {
  id: 'p-1',
  name: 'PRIME',
  logo_url: 'logo.png',
  contacts: [{ name: 'Иван', role: 'Менеджер', phone: '+7', email: '', telegram: '' }],
  access_login: 'l',
  access_password: 'p',
  notes: 'n',
}

function renderWith(ctxPlatform) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ platform: ctxPlatform, reload: vi.fn() }} />}>
          <Route path="/" element={<PlatformContactsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
})

describe('PlatformContactsTab', () => {
  it('renders existing contacts hydrated from outlet', () => {
    renderWith(platformWithOne)
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument()
  })

  it('add and remove contact buttons mutate count', () => {
    renderWith(platformWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(2)
    const removeBtns = screen.getAllByRole('button', { name: /Удалить контакт/i })
    fireEvent.click(removeBtns[0])
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(1)
  })

  it('save filters empty contacts and sends full payload (branding unchanged)', async () => {
    platformApi.mockResolvedValueOnce({ data: {}, error: null })
    renderWith(platformWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    fireEvent.change(screen.getByDisplayValue('Иван'), { target: { value: 'Иван П.' } })
    const save = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('update', expect.objectContaining({
        id: 'p-1',
        name: 'PRIME',
        logo_url: 'logo.png',
        access_login: 'l',
        access_password: 'p',
        notes: 'n',
      }))
    })
    const call = platformApi.mock.calls[0][1]
    expect(call.contacts).toHaveLength(1)
    expect(call.contacts[0].name).toBe('Иван П.')
  })
})
