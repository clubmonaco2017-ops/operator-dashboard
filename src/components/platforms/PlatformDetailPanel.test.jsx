import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { PlatformDetailPanel } from './PlatformDetailPanel.jsx'

const platform = {
  id: 'p-1',
  name: 'PRIME',
  contacts: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/platforms/:platformId"
          element={
            <Outlet context={{ rows: [platform], reload: vi.fn() }} />
          }
        >
          <Route element={<PlatformDetailPanel onBack={() => {}} onChanged={() => {}} />}>
            <Route index element={<div data-testid="tab-content">empty</div>} />
            <Route path="branding" element={<div data-testid="tab-content">branding</div>} />
            <Route path="contacts" element={<div data-testid="tab-content">contacts</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlatformDetailPanel', () => {
  it('renders header with name and contacts subtitle', () => {
    renderAt('/admin/platforms/p-1/branding')
    expect(screen.getByRole('heading', { name: 'PRIME' })).toBeInTheDocument()
    expect(screen.getByText(/3 контакта/)).toBeInTheDocument()
  })

  it('renders both tabs', () => {
    renderAt('/admin/platforms/p-1/branding')
    expect(screen.getByRole('tab', { name: /Бренд/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Контакты/i })).toBeInTheDocument()
  })

  it('renders child route content via Outlet', () => {
    renderAt('/admin/platforms/p-1/contacts')
    expect(screen.getByTestId('tab-content')).toHaveTextContent('contacts')
  })
})
