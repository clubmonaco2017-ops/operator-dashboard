import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/usePendingDeletionCount.js', () => ({
  usePendingDeletionCount: vi.fn(),
}))

import { MobileTopBar } from './MobileTopBar.jsx'
import { SectionTitleProvider, useSectionTitle } from '../../hooks/useSectionTitle.jsx'
import { useAuth } from '../../useAuth.jsx'
import { usePendingDeletionCount } from '../../hooks/usePendingDeletionCount.js'

function TitleSetter({ title, backTo }) {
  useSectionTitle(title, { backTo })
  return null
}

function renderAt(path, { user, pending = 0, title = null, backTo = null, onMenuClick = vi.fn() }) {
  useAuth.mockReturnValue({ user })
  usePendingDeletionCount.mockReturnValue(pending)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SectionTitleProvider>
        {title !== null && <TitleSetter title={title} backTo={backTo} />}
        <Routes>
          <Route path="*" element={<MobileTopBar onMenuClick={onMenuClick} />} />
        </Routes>
      </SectionTitleProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileTopBar>', () => {
  it('renders hamburger menu button by default', () => {
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи' })
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toBeInTheDocument()
  })

  it('renders the section title from context', () => {
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи' })
    expect(screen.getByText('Задачи')).toBeInTheDocument()
  })

  it('falls back to route-derived title when context is empty', () => {
    renderAt('/notifications', { user: { role: 'superadmin' } })
    expect(screen.getByText('Оповещения')).toBeInTheDocument()
  })

  it('falls back to "Дашборд" on root route when context empty', () => {
    renderAt('/', { user: { role: 'operator' } })
    expect(screen.getByText('Дашборд')).toBeInTheDocument()
  })

  it('renders back arrow instead of hamburger when backTo is set', () => {
    renderAt('/tasks/42', {
      user: { role: 'operator' },
      title: 'Задача 42',
      backTo: '/tasks',
    })
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Открыть меню' })).toBeNull()
  })

  it('calls onMenuClick when hamburger pressed', () => {
    const onMenuClick = vi.fn()
    renderAt('/tasks', { user: { role: 'operator' }, title: 'Задачи', onMenuClick })
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }))
    expect(onMenuClick).toHaveBeenCalledTimes(1)
  })

  it('shows notifications icon for superadmin only', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 0 })
    expect(screen.getByLabelText('Оповещения')).toBeInTheDocument()
  })

  it('hides notifications icon for non-superadmin', () => {
    renderAt('/tasks', { user: { role: 'admin' }, title: 'Задачи', pending: 0 })
    expect(screen.queryByLabelText('Оповещения')).toBeNull()
  })

  it('shows pending count badge on notifications icon', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 7 })
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('shows "99+" when pending count exceeds 99', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 142 })
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('hides badge when pending count is 0', () => {
    renderAt('/tasks', { user: { role: 'superadmin' }, title: 'Задачи', pending: 0 })
    expect(screen.queryByText('0')).toBeNull()
  })
})
