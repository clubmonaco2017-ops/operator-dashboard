import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DollarSign } from 'lucide-react'
import { KpiCard } from './KpiCard.jsx'

describe('<KpiCard>', () => {
  it('renders label, value, icon, sublabel', () => {
    render(
      <KpiCard
        label="Итого"
        value="1 234 $"
        icon={DollarSign}
        sublabel="Пик: 14:00 · 412 $"
      />,
    )
    expect(screen.getByText('Итого')).toBeInTheDocument()
    expect(screen.getByText('1 234 $')).toBeInTheDocument()
    expect(screen.getByText('Пик: 14:00 · 412 $')).toBeInTheDocument()
  })

  it('renders delta with up arrow + green when direction=up', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 18, direction: 'up' }} />)
    const delta = screen.getByText(/↗.*18%/)
    expect(delta).toBeInTheDocument()
    expect(delta).toHaveClass('text-green-600')
  })

  it('renders delta with down arrow + red when direction=down', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 12, direction: 'down' }} />)
    const delta = screen.getByText(/↘.*12%/)
    expect(delta).toBeInTheDocument()
    expect(delta).toHaveClass('text-red-600')
  })

  it('renders delta with neutral arrow + muted when direction=neutral', () => {
    render(<KpiCard label="X" value="42" delta={{ value: 0, direction: 'neutral' }} />)
    expect(screen.getByText(/→.*0%/)).toBeInTheDocument()
  })

  it('omits delta when delta prop not provided', () => {
    render(<KpiCard label="X" value="42" />)
    expect(screen.queryByText(/↗|↘|→/)).toBeNull()
  })

  it('applies accent border when accentColor=blue', () => {
    const { container } = render(<KpiCard label="X" value="42" accentColor="blue" />)
    const article = container.querySelector('article')
    expect(article.className).toMatch(/border-l-blue-500/)
  })
})
