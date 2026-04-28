import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useUserOverdueCount.js', () => ({ useUserOverdueCount: vi.fn() }))
vi.mock('../../hooks/useUserTeamMembership.js', () => ({ useUserTeamMembership: vi.fn() }))

import { MobileBottomNav } from './MobileBottomNav.jsx'
import { useAuth } from '../../useAuth.jsx'
import { useUserOverdueCount } from '../../hooks/useUserOverdueCount.js'
import { useUserTeamMembership } from '../../hooks/useUserTeamMembership.js'

function setup({ user, overdue = 0, hasTeam = false, path = '/' } = {}) {
  useAuth.mockReturnValue({ user })
  useUserOverdueCount.mockReturnValue({ count: overdue })
  useUserTeamMembership.mockReturnValue({ has: hasTeam })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileBottomNav />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileBottomNav>', () => {
  it('always shows Dashboard for authenticated users', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Дашборд/ })).toBeInTheDocument()
  })

  it('hides Staff for users without create_users', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByRole('link', { name: /Сотрудники/ })).toBeNull()
  })

  it('shows Staff for admin', () => {
    setup({
      user: { id: 1, role: 'admin', permissions: ['create_users', 'manage_clients', 'view_all_tasks'] },
    })
    expect(screen.getByRole('link', { name: /Сотрудники/ })).toBeInTheDocument()
  })

  it('hides Clients for users without manage_clients', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.queryByRole('link', { name: /Клиенты/ })).toBeNull()
  })

  it('shows Teams for teamlead role', () => {
    setup({ user: { id: 1, role: 'teamlead', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Команды/ })).toBeInTheDocument()
  })

  it('hides Teams for operator without team membership', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      hasTeam: false,
    })
    expect(screen.queryByRole('link', { name: /Команды/ })).toBeNull()
  })

  it('shows Teams for operator WITH team membership', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      hasTeam: true,
    })
    expect(screen.getByRole('link', { name: /Команды/ })).toBeInTheDocument()
  })

  it('shows Tasks for users with view_own_tasks', () => {
    setup({ user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] } })
    expect(screen.getByRole('link', { name: /Задачи/ })).toBeInTheDocument()
  })

  it('shows overdue badge on Tasks when count > 0', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      overdue: 5,
    })
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('caps overdue badge at "99+"', () => {
    setup({
      user: { id: 1, role: 'operator', permissions: ['view_own_tasks'] },
      overdue: 142,
    })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('renders no notifications, theme, or profile icons (only nav items)', () => {
    setup({ user: { id: 1, role: 'superadmin' } })
    expect(screen.queryByLabelText('Оповещения')).toBeNull()
    expect(screen.queryByLabelText('Тема оформления')).toBeNull()
    expect(screen.queryByLabelText('Меню пользователя')).toBeNull()
  })
})
