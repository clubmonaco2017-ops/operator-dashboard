import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'

vi.mock('../../useAuth.jsx', () => ({
  useAuth: vi.fn(),
}))
vi.mock('../../hooks/useUserOverdueCount.js', () => ({
  useUserOverdueCount: vi.fn(),
}))
vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: vi.fn(),
}))
vi.mock('../../hooks/useUserTeamMembership.js', () => ({
  useUserTeamMembership: vi.fn(),
}))

import { RailNav } from './RailNav.jsx'
import { useAuth } from '../../useAuth.jsx'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

function setup({ user, overdue = 0, pending = 0, hasTeam = false }) {
  useAuth.mockReturnValue({ user, logout: vi.fn() })
  useUserOverdueCount.mockReturnValue({ count: overdue })
  usePendingDeletionCount.mockReturnValue(pending)
  useUserTeamMembership.mockReturnValue({ has: hasTeam })
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <RailNav />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<RailNav>', () => {
  it('shows Dashboard icon for any authenticated user', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.getByLabelText('Дашборд')).toBeInTheDocument()
  })

  it('hides Staff icon when user lacks create_users permission', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByLabelText('Сотрудники')).toBeNull()
  })

  it('shows Staff icon for admin (has create_users)', () => {
    setup({
      user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'create_tasks'] },
    })
    expect(screen.getByLabelText('Сотрудники')).toBeInTheDocument()
  })

  it('shows badge with overdue count on Tasks icon when count > 0', () => {
    setup({
      user: { id: 1, role: 'admin', permissions: ['view_all_tasks', 'create_tasks'] },
      overdue: 5,
    })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows "99+" when overdue count exceeds 99', () => {
    setup({
      user: { id: 1, role: 'admin', permissions: ['view_all_tasks'] },
      overdue: 142,
    })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('hides Notifications icon for non-superadmin', () => {
    setup({ user: { id: 1, role: 'admin', permissions: ['create_users'] } })
    expect(screen.queryByLabelText('Оповещения')).toBeNull()
  })

  it('shows Notifications icon for superadmin', () => {
    setup({ user: { id: 1, role: 'superadmin' } })
    expect(screen.getByLabelText('Оповещения')).toBeInTheDocument()
  })

  it('renders UserMenuDropdown trigger at the bottom', () => {
    setup({ user: { id: 1, alias: 'Тест', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
  })
})
