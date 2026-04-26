import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardPeriodProvider, useDashboardPeriod } from './DashboardPeriodProvider.jsx'
import { DateSelector } from './DateSelector.jsx'

function Reader() {
  const { period } = useDashboardPeriod()
  return (
    <div>
      <span data-testid="preset">{period.preset}</span>
      <span data-testid="from">{period.from}</span>
      <span data-testid="to">{period.to}</span>
    </div>
  )
}

function Wrapped() {
  return (
    <DashboardPeriodProvider>
      <DateSelector />
      <Reader />
    </DashboardPeriodProvider>
  )
}

describe('<DateSelector>', () => {
  it('renders pill with default preset label "Сегодня"', () => {
    render(<Wrapped />)
    expect(screen.getByRole('button', { name: /Сегодня/ })).toBeInTheDocument()
  })

  it('opens popover with preset buttons when pill clicked', () => {
    render(<Wrapped />)
    fireEvent.click(screen.getByRole('button', { name: /Сегодня/ }))
    expect(screen.getByRole('button', { name: 'Вчера' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Неделя' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Месяц' })).toBeInTheDocument()
  })

  it('switching preset updates context (Вчера)', () => {
    render(<Wrapped />)
    fireEvent.click(screen.getByRole('button', { name: /Сегодня/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Вчера' }))
    expect(screen.getByTestId('preset')).toHaveTextContent('yesterday')
    // from === to (single day)
    expect(screen.getByTestId('from').textContent).toBe(screen.getByTestId('to').textContent)
  })
})
