import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients'] },
    logout: vi.fn(),
  }),
}))
vi.mock('../../hooks/useUserOverdueCount.js', () => ({
  useUserOverdueCount: () => ({ count: 0 }),
}))
vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: () => 0,
}))
vi.mock('../../hooks/useUserTeamMembership.js', () => ({
  useUserTeamMembership: () => ({ has: false }),
}))

import { AppShell } from './AppShell.jsx'

describe('<AppShell>', () => {
  it('renders rail nav and outlet content (single-row grid, no header)', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Главное меню')).toBeInTheDocument()
    expect(screen.getByTestId('page')).toHaveTextContent('Page Body')
  })

  it('does not render any breadcrumb navigation', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div data-testid="dash">Dash</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('dash')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
  })
})
