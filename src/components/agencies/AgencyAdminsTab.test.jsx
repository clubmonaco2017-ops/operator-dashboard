import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

import { AgencyAdminsTab } from './AgencyAdminsTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = { id: 'a-1' }

function renderWith() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ agency, reload: vi.fn() }} />}>
          <Route path="/" element={<AgencyAdminsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  // Mock dashboard_users + list_agency_admins
  supabase.from.mockImplementation((table) => {
    if (table === 'dashboard_users') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 1, email: 'a1@x.com', first_name: 'А', last_name: 'А' },
                    { id: 2, email: 'a2@x.com', first_name: 'Б', last_name: 'Б' },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    }
    return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }
  })
  supabase.rpc.mockImplementation((name) => {
    if (name === 'list_agency_admins') {
      return Promise.resolve({ data: [{ admin_id: 1 }], error: null })
    }
    return Promise.resolve({ error: null })
  })
})

describe('AgencyAdminsTab', () => {
  it('renders admins with current assignments', async () => {
    renderWith()
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()    // admin 1 assigned
    expect(checkboxes[1]).not.toBeChecked() // admin 2 not assigned
  })

  it('calls assign_admin_to_agency on unchecked → checked', async () => {
    renderWith()
    await waitFor(() => screen.getAllByRole('checkbox'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]) // unchecked → checked
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('assign_admin_to_agency', {
        p_admin_id: 2,
        p_agency_id: 'a-1',
      })
    })
  })

  it('calls remove_admin_from_agency on checked → unchecked', async () => {
    renderWith()
    await waitFor(() => screen.getAllByRole('checkbox'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // checked → unchecked
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('remove_admin_from_agency', {
        p_admin_id: 1,
        p_agency_id: 'a-1',
      })
    })
  })
})
