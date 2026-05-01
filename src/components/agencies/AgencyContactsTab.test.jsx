import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { AgencyContactsTab } from './AgencyContactsTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agencyWithOne = {
  id: 'a-1',
  contacts: [{ name: 'Иван', role: 'Менеджер', phone: '+7', email: '', telegram: '' }],
}

function renderWith(ctxAgency) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ agency: ctxAgency, reload: vi.fn() }} />}>
          <Route path="/" element={<AgencyContactsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('AgencyContactsTab', () => {
  it('renders existing contacts hydrated from outlet', () => {
    renderWith(agencyWithOne)
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Менеджер')).toBeInTheDocument()
  })

  it('add and remove contact buttons mutate count', () => {
    renderWith(agencyWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(2)
    // Remove appears since now > 1
    const removeBtns = screen.getAllByRole('button', { name: /Удалить контакт/i })
    fireEvent.click(removeBtns[0])
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(1)
  })

  it('save filters empty contacts and sends contacts-only slice', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    renderWith(agencyWithOne)
    // Add empty contact (will be filtered out)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    // Trigger dirty by editing existing
    fireEvent.change(screen.getByDisplayValue('Иван'), { target: { value: 'Иван П.' } })
    const save = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'update_agency_branding',
        expect.objectContaining({
          p_id: 'a-1',
          p_logo_url: null,
          p_access_login: null,
          p_access_password: null,
          p_notes: null,
        }),
      )
    })
    // Verify only 1 contact in the array (empty filtered)
    const call = supabase.rpc.mock.calls[0][1]
    expect(call.p_contacts).toHaveLength(1)
    expect(call.p_contacts[0].name).toBe('Иван П.')
  })
})
