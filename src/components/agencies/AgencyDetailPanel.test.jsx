import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { AgencyDetailPanel } from './AgencyDetailPanel.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = {
  out_id: 'a-1',
  out_name: 'Test',
  out_platform_id: 'p-1',
  out_platform_name: 'PRIME',
  out_logo_url: null,
  out_contacts: [],
  out_access_login: null,
  out_access_password: null,
  out_notes: null,
  out_is_active: true,
  out_created_at: null,
  out_admin_count: 0,
  out_user_count: 0,
  out_client_count: 0,
  out_team_count: 0,
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/agencies/:agencyId" element={<AgencyDetailPanel onBack={() => {}} onChanged={() => {}} />}>
          <Route index element={<div data-testid="tab-content">empty</div>} />
          <Route path="branding" element={<div data-testid="tab-content">branding</div>} />
          <Route path="contacts" element={<div data-testid="tab-content">contacts</div>} />
          <Route path="admins" element={<div data-testid="tab-content">admins</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: [agency], error: null })
})

describe('AgencyDetailPanel', () => {
  it('renders header with name + platform + status badge', async () => {
    renderAt('/admin/agencies/a-1/branding')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test' })).toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
    expect(screen.getByText(/Активно/)).toBeInTheDocument()
  })

  it('renders all 3 tabs', async () => {
    renderAt('/admin/agencies/a-1/branding')
    await waitFor(() => screen.getByRole('tab', { name: /Бренд/i }))
    expect(screen.getByRole('tab', { name: /Бренд/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Контакты/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Админы/i })).toBeInTheDocument()
  })

  it('renders child route content via Outlet', async () => {
    renderAt('/admin/agencies/a-1/contacts')
    await waitFor(() => {
      expect(screen.getByTestId('tab-content')).toHaveTextContent('contacts')
    })
  })
})
