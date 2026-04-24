import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RefCodePreview } from './RefCodePreview.jsx'

describe('<RefCodePreview>', () => {
  it('shows placeholder when fields empty', () => {
    render(<RefCodePreview role="moderator" firstName="" lastName="" />)
    expect(screen.getByText(/MOD-…-###/)).toBeInTheDocument()
  })

  it('builds code from inputs', () => {
    render(<RefCodePreview role="moderator" firstName="Иван" lastName="Петров" />)
    expect(screen.getByText(/MOD-ИванП-###/)).toBeInTheDocument()
  })

  it('capitalizes lowercase input', () => {
    render(<RefCodePreview role="teamlead" firstName="анна" lastName="михайлова" />)
    expect(screen.getByText(/TL-АннаМ-###/)).toBeInTheDocument()
  })

  it('shows nothing for unknown role', () => {
    const { container } = render(<RefCodePreview role="foo" firstName="A" lastName="B" />)
    expect(container.textContent).toContain('—')
  })
})
