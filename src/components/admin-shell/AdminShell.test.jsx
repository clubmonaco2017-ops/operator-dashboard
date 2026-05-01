import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import { AdminShell } from './AdminShell.jsx'

function renderAtPath(path = '/admin/platforms') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route
            path="platforms"
            element={<div data-testid="section-content">platforms-content</div>}
          />
          <Route
            path="platforms/:foo"
            element={<div data-testid="section-content">platforms-sub</div>}
          />
          <Route
            path="agencies"
            element={<div data-testid="section-content">agencies-content</div>}
          />
          <Route
            path="agencies/:agencyId/:tab"
            element={<div data-testid="section-content">agencies-tab</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminShell', () => {
  it('renders the «Настройки» header', () => {
    renderAtPath('/admin/platforms')
    expect(
      screen.getByRole('heading', { name: 'Настройки' }),
    ).toBeInTheDocument()
  })

  it('renders both navigation items as links', () => {
    renderAtPath('/admin/platforms')
    expect(
      screen.getByRole('link', { name: /Платформы/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Агентства/i }),
    ).toBeInTheDocument()
  })

  it('marks the active section based on URL (top-level)', () => {
    renderAtPath('/admin/platforms')
    const platforms = screen.getByRole('link', { name: /Платформы/i })
    const agencies = screen.getByRole('link', { name: /Агентства/i })
    expect(platforms).toHaveAttribute('aria-current', 'page')
    expect(agencies).not.toHaveAttribute('aria-current')
  })

  it('keeps section active on nested URL (end={false})', () => {
    renderAtPath('/admin/agencies/123/contacts')
    const agencies = screen.getByRole('link', { name: /Агентства/i })
    const platforms = screen.getByRole('link', { name: /Платформы/i })
    expect(agencies).toHaveAttribute('aria-current', 'page')
    expect(platforms).not.toHaveAttribute('aria-current')
  })

  it('renders child route content via Outlet', () => {
    renderAtPath('/admin/platforms')
    expect(screen.getByTestId('section-content')).toHaveTextContent(
      'platforms-content',
    )
  })
})
