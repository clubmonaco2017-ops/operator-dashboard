import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { AgencyListPage, AgencyDetailEmpty } from './AgencyListPage.jsx'
import { supabase } from '../supabaseClient.js'

const mockRows = [
  {
    out_id: 'a-1', out_name: 'Active Agency', out_platform_id: 'p-1', out_platform_name: 'PRIME',
    out_is_active: true, out_admin_count: 1, out_user_count: 3, out_client_count: 5, out_team_count: 2, out_created_at: null,
  },
  {
    out_id: 'a-2', out_name: 'Archived Agency', out_platform_id: 'p-2', out_platform_name: 'AFA',
    out_is_active: false, out_admin_count: 0, out_user_count: 0, out_client_count: 0, out_team_count: 0, out_created_at: null,
  },
]

function renderPage(initialPath = '/admin/agencies') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/agencies" element={<AgencyListPage />}>
          <Route index element={<AgencyDetailEmpty />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockImplementation((name) => {
    if (name === 'list_all_agencies') {
      return Promise.resolve({ data: mockRows, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
})

describe('AgencyListPage', () => {
  it('renders title with count and active agencies by default', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Active Agency')).toBeInTheDocument()
    })
    // Archived should NOT show by default
    expect(screen.queryByText('Archived Agency')).not.toBeInTheDocument()
  })

  it('switching filter chip shows archived agencies', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.click(screen.getByRole('radio', { name: /Архив/i }))
    await waitFor(() => {
      expect(screen.getByText('Archived Agency')).toBeInTheDocument()
    })
    expect(screen.queryByText('Active Agency')).not.toBeInTheDocument()
  })

  it('search filters list by name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.click(screen.getByRole('radio', { name: /Все/i }))
    await waitFor(() => screen.getByText('Archived Agency'))
    const searchInput = screen.getByPlaceholderText(/Поиск/i)
    fireEvent.change(searchInput, { target: { value: 'archived' } })
    await waitFor(() => {
      expect(screen.queryByText('Active Agency')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Archived Agency')).toBeInTheDocument()
  })

  it('shows EmptyFilter when search filters everything out', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument()
    })
  })

  it('renders detail empty hint when no agency selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Выберите агентство/i)).toBeInTheDocument()
    })
  })
})
