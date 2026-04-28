import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../useAuth.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('../../hooks/useTheme.js', () => ({ useTheme: vi.fn() }))

import { MobileNavDrawer } from './MobileNavDrawer.jsx'
import { useAuth } from '../../useAuth.jsx'
import { useTheme } from '../../hooks/useTheme.js'

function setup({
  user,
  open = true,
  onOpenChange = vi.fn(),
  onLogout = vi.fn(),
  theme = 'system',
  setTheme = vi.fn(),
} = {}) {
  useAuth.mockReturnValue({ user, logout: onLogout })
  useTheme.mockReturnValue([theme, setTheme])
  return render(
    <MemoryRouter>
      <MobileNavDrawer open={open} onOpenChange={onOpenChange} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('<MobileNavDrawer>', () => {
  it('does not render content when closed', () => {
    setup({ user: { id: 1, role: 'operator' }, open: false })
    expect(screen.queryByText('Выйти')).toBeNull()
  })

  it('shows the user display name and role label', () => {
    setup({ user: { id: 1, alias: 'Артём', role: 'admin' } })
    expect(screen.getByText('Артём')).toBeInTheDocument()
    expect(screen.getByText('Администратор')).toBeInTheDocument()
  })

  it('shows the theme section with current theme highlighted', () => {
    setup({ user: { id: 1, role: 'admin' }, theme: 'dark' })
    expect(screen.getByText('Тема')).toBeInTheDocument()
    const darkBtn = screen.getByRole('button', { name: /Тёмная/ })
    expect(darkBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls setTheme when theme option clicked', () => {
    const setTheme = vi.fn()
    setup({ user: { id: 1, role: 'admin' }, theme: 'system', setTheme })
    fireEvent.click(screen.getByRole('button', { name: /Светлая/ }))
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('shows admin links only for superadmin', () => {
    setup({ user: { id: 1, role: 'superadmin' } })
    expect(screen.getByText('Платформы')).toBeInTheDocument()
    expect(screen.getByText('Агентства')).toBeInTheDocument()
  })

  it('hides admin links for non-superadmin', () => {
    setup({ user: { id: 1, role: 'admin' } })
    expect(screen.queryByText('Платформы')).toBeNull()
    expect(screen.queryByText('Агентства')).toBeNull()
  })

  it('calls logout on logout button click', () => {
    const onLogout = vi.fn()
    setup({ user: { id: 1, role: 'admin' }, onLogout })
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('renders a sheet content slot when open', () => {
    setup({ user: { id: 1, role: 'admin' }, open: true })
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull()
  })
})
