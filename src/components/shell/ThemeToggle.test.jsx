import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle.jsx'

beforeAll(() => {
  // matchMedia is not implemented in jsdom — stub it
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

describe('<ThemeToggle>', () => {
  it('renders trigger button with theme aria-label', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Тема оформления' })).toBeInTheDocument()
  })

  it('opens dropdown and shows three theme options', async () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByLabelText('Тема оформления'))
    expect(await screen.findByText('Системная')).toBeInTheDocument()
    expect(screen.getByText('Светлая')).toBeInTheDocument()
    expect(screen.getByText('Тёмная')).toBeInTheDocument()
  })

  it('clicking theme item writes localStorage.theme', async () => {
    localStorage.clear()
    render(<ThemeToggle />)
    fireEvent.click(screen.getByLabelText('Тема оформления'))
    fireEvent.click(await screen.findByText('Тёмная'))
    expect(localStorage.getItem('theme')).toBe('dark')
  })
})
