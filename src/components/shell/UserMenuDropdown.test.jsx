import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UserMenuDropdown } from './UserMenuDropdown.jsx'

// matchMedia is not implemented in jsdom — stub it
beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

const sampleUser = {
  alias: 'Артём Ш.',
  firstName: 'Артём',
  role: 'admin',
  refCode: 'ADM-АртёмШ-001',
}

describe('<UserMenuDropdown>', () => {
  it('renders avatar trigger with computed initials', () => {
    render(<UserMenuDropdown user={sampleUser} onLogout={() => {}} />)
    expect(screen.getByRole('button', { name: 'Меню пользователя' })).toBeInTheDocument()
    expect(screen.getByText('АШ')).toBeInTheDocument()
  })

  it('opens dropdown and shows user info + logout option on click', async () => {
    render(<UserMenuDropdown user={sampleUser} onLogout={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Меню пользователя' }))
    expect(await screen.findByText('Артём Ш.')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('ADM-АртёмШ-001')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Выйти' })).toBeInTheDocument()
  })

  it('calls onLogout when "Выйти" menuitem is clicked', async () => {
    const onLogout = vi.fn()
    render(<UserMenuDropdown user={sampleUser} onLogout={onLogout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Меню пользователя' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Выйти' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('falls back to firstName when alias missing', () => {
    render(
      <UserMenuDropdown
        user={{ firstName: 'Иван', role: 'operator', refCode: 'OP-Иван-002' }}
        onLogout={() => {}}
      />,
    )
    expect(screen.getByText('И')).toBeInTheDocument()
  })
})
