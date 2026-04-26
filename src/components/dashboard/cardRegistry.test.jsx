import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderCards } from './cardRegistry.jsx'

const FAKE_REGISTRY = [
  {
    id: 'a',
    component: function A({ x }) {
      return <div data-testid="A">A:{x}</div>
    },
    requires: 'view_all_revenue',
    props: { x: '1' },
  },
  {
    id: 'b',
    component: function B({ x }) {
      return <div data-testid="B">B:{x}</div>
    },
    requires: 'view_only_admin',
  },
  {
    id: 'c',
    component: function C() {
      return <div data-testid="C">C</div>
    },
    // no `requires` → always shown
  },
]

describe('renderCards', () => {
  it('filters cards by hasPermission', () => {
    const user = { role: 'admin', permissions: ['view_all_revenue'] }
    render(<>{renderCards(FAKE_REGISTRY, user, { x: 'shared' })}</>)
    expect(screen.getByTestId('A')).toBeInTheDocument()
    expect(screen.queryByTestId('B')).toBeNull()
    expect(screen.getByTestId('C')).toBeInTheDocument()
  })

  it('superadmin sees all cards regardless of requires', () => {
    const user = { role: 'superadmin', permissions: [] }
    render(<>{renderCards(FAKE_REGISTRY, user)}</>)
    expect(screen.getByTestId('A')).toBeInTheDocument()
    expect(screen.getByTestId('B')).toBeInTheDocument()
    expect(screen.getByTestId('C')).toBeInTheDocument()
  })

  it('passes registry props + render-time props to each component', () => {
    const user = { role: 'superadmin', permissions: [] }
    render(<>{renderCards(FAKE_REGISTRY, user, { x: 'shared' })}</>)
    // A has registry x:'1' (registry props win? render-time wins?). Per spec §3.3:
    //   <Component {...c.props} {...props} /> → render-time props OVERRIDE registry props.
    expect(screen.getByTestId('A')).toHaveTextContent('A:shared')
    // C has no registry props → gets render-time x
    expect(screen.getByTestId('C')).toHaveTextContent('C')
  })

  it('returns empty array when user has no permissions and no card has empty requires', () => {
    const user = null
    const minimal = [{ id: 'b', component: () => <div>B</div>, requires: 'view_only_admin' }]
    const out = renderCards(minimal, user)
    expect(out).toHaveLength(0)
  })
})
