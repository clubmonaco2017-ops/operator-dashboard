import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Section, SubSection } from './Section.jsx'

describe('<Section>', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders title, actions, and children when expanded', () => {
    render(
      <Section id="t1" title="Аналитика" actions={<button>Refresh</button>}>
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByText('Аналитика')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })

  it('collapses children when toggle clicked, persists state to localStorage', () => {
    render(
      <Section id="t2" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByTestId('body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Section/ }))
    expect(screen.queryByTestId('body')).toBeNull()
    expect(localStorage.getItem('dashboard.section.t2.expanded')).toBe('false')
  })

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem('dashboard.section.t3.expanded', 'false')
    render(
      <Section id="t3" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.queryByTestId('body')).toBeNull()
  })

  it('default expanded=true when no localStorage entry', () => {
    render(
      <Section id="t4" title="Section">
        <p data-testid="body">Body</p>
      </Section>,
    )
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})

describe('<SubSection>', () => {
  it('renders title and children (no collapse, no localStorage)', () => {
    render(
      <SubSection title="Производительность">
        <p data-testid="body">Body</p>
      </SubSection>,
    )
    expect(screen.getByText('Производительность')).toBeInTheDocument()
    expect(screen.getByTestId('body')).toBeInTheDocument()
  })
})
