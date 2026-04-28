import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'view_all_tasks'] },
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
vi.mock('../../hooks/useTheme.js', () => ({
  useTheme: () => ['system', vi.fn()],
}))

import { MobileShell } from './MobileShell.jsx'

describe('<MobileShell>', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders TopBar, Outlet content and BottomNav', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<div data-testid="page">Клиенты body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-top-bar"]')).not.toBeNull()
    expect(screen.getByTestId('page')).toHaveTextContent('Клиенты body')
    expect(document.querySelector('[data-slot="mobile-bottom-nav"]')).not.toBeNull()
  })

  it('opens drawer when hamburger clicked', () => {
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<div>page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('closes drawer when route changes', () => {
    function Trigger() {
      const navigate = useNavigate()
      return (
        <button data-testid="go" onClick={() => navigate('/tasks')}>
          go
        </button>
      )
    }
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<MobileShell />}>
            <Route path="/clients" element={<Trigger />} />
            <Route path="/tasks" element={<div data-testid="tasks">tasks page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('go'))
    expect(screen.getByTestId('tasks')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Выйти' })).toBeNull()
  })
})
