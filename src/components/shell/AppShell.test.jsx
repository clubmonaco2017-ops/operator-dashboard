import { describe, it, expect, vi, beforeEach } from 'vitest'
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
vi.mock('../../hooks/useTheme.js', () => ({
  useTheme: () => ['system', vi.fn()],
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}))

import { AppShell } from './AppShell.jsx'
import { useIsMobile } from '@/hooks/use-mobile'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<AppShell> desktop branch', () => {
  it('renders rail nav and outlet content (single-row grid, no header)', () => {
    useIsMobile.mockReturnValue(false)
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
    useIsMobile.mockReturnValue(false)
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

describe('<AppShell> mobile branch', () => {
  it('renders MobileShell when isMobile=true', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-shell"]')).not.toBeNull()
    // BottomNav and RailNav both have aria-label="Главное меню" — both branches will match.
    // Mobile-specific check: the data-slot above. Also verify outlet content renders.
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it('does NOT render MobileShell when isMobile=false', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/clients" element={<div data-testid="page">Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-slot="mobile-shell"]')).toBeNull()
    // Desktop rail-nav uses aside with role and aria-label
    const rails = document.querySelectorAll('aside[aria-label="Главное меню"]')
    expect(rails.length).toBeGreaterThan(0)
  })
})
