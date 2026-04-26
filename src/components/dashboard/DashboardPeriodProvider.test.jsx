import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  DashboardPeriodProvider,
  useDashboardPeriod,
  derivePreviousPeriod,
} from './DashboardPeriodProvider.jsx'

function Probe({ onMount }) {
  const ctx = useDashboardPeriod()
  onMount?.(ctx)
  return (
    <div>
      <span data-testid="preset">{ctx.period.preset}</span>
      <span data-testid="from">{ctx.period.from}</span>
      <span data-testid="to">{ctx.period.to}</span>
      <span data-testid="hmin">{ctx.period.hours[0]}</span>
      <span data-testid="hmax">{ctx.period.hours[1]}</span>
      <button
        onClick={() =>
          ctx.setPeriod((p) => ({ ...p, preset: 'week', from: '2026-04-01', to: '2026-04-07' }))
        }
      >
        set week
      </button>
    </div>
  )
}

describe('<DashboardPeriodProvider>', () => {
  it('provides default period (today / hours [0,23])', () => {
    render(
      <DashboardPeriodProvider>
        <Probe />
      </DashboardPeriodProvider>,
    )
    expect(screen.getByTestId('preset')).toHaveTextContent('today')
    expect(screen.getByTestId('hmin')).toHaveTextContent('0')
    expect(screen.getByTestId('hmax')).toHaveTextContent('23')
    expect(screen.getByTestId('from').textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('updates period via setPeriod', () => {
    render(
      <DashboardPeriodProvider>
        <Probe />
      </DashboardPeriodProvider>,
    )
    act(() => {
      screen.getByText('set week').click()
    })
    expect(screen.getByTestId('preset')).toHaveTextContent('week')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-04-01')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-04-07')
  })

  it('throws when useDashboardPeriod is used outside provider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/must be used inside DashboardPeriodProvider/)
    errSpy.mockRestore()
  })
})

describe('derivePreviousPeriod', () => {
  it('today → yesterday (single-day)', () => {
    const out = derivePreviousPeriod({ preset: 'today', from: '2026-04-26', to: '2026-04-26', hours: [0, 23] })
    expect(out).toEqual({ preset: 'yesterday', from: '2026-04-25', to: '2026-04-25', hours: [0, 23] })
  })
  it('yesterday → day-before', () => {
    const out = derivePreviousPeriod({ preset: 'yesterday', from: '2026-04-25', to: '2026-04-25', hours: [0, 23] })
    expect(out.from).toBe('2026-04-24')
    expect(out.to).toBe('2026-04-24')
  })
  it('week → previous 7-day window', () => {
    const out = derivePreviousPeriod({ preset: 'week', from: '2026-04-20', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-04-13')
    expect(out.to).toBe('2026-04-19')
  })
  it('month → equal-length window before', () => {
    const out = derivePreviousPeriod({ preset: 'month', from: '2026-03-28', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-02-26')
    expect(out.to).toBe('2026-03-27')
  })
  it('custom (3-day range) → 3 days immediately before', () => {
    const out = derivePreviousPeriod({ preset: 'custom', from: '2026-04-24', to: '2026-04-26', hours: [0, 23] })
    expect(out.from).toBe('2026-04-21')
    expect(out.to).toBe('2026-04-23')
  })
  it('preserves hours unchanged', () => {
    const out = derivePreviousPeriod({ preset: 'today', from: '2026-04-26', to: '2026-04-26', hours: [9, 18] })
    expect(out.hours).toEqual([9, 18])
  })
})
