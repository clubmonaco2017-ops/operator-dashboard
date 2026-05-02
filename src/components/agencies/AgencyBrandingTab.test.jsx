import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { AgencyBrandingTab } from './AgencyBrandingTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = {
  id: 'a-1',
  name: 'Test',
  logo_url: 'https://example.com/logo.png',
  access_login: 'login1',
  access_password: 'pw1',
  notes: 'note1',
}

function renderWithContext(ctxAgency = agency) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ agency: ctxAgency, reload: vi.fn() }} />}>
          <Route path="/" element={<AgencyBrandingTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('AgencyBrandingTab', () => {
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

  it('calls update_agency_branding with branding slice (other params null) on save', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    renderWithContext()
    fireEvent.change(screen.getByLabelText(/Логин/i), { target: { value: 'login2' } })
    const btn = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('update_agency_branding', expect.objectContaining({
        p_id: 'a-1',
        p_access_login: 'login2',
        p_contacts: null,  // contacts not touched
      }))
    })
  })
})
