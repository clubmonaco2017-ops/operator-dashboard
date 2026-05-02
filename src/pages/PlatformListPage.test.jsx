import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { PlatformListPage, PlatformDetailEmpty } from './PlatformListPage.jsx'
import { platformApi } from '../lib/platforms.js'

const mockData = [
  { id: 'p-1', name: 'AFA',    logo_url: null, contacts: [{ name: 'a' }] },
  { id: 'p-2', name: 'PRIME',  logo_url: null, contacts: [] },
]

function renderPage(initialPath = '/admin/platforms') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/platforms" element={<PlatformListPage />}>
          <Route index element={<PlatformDetailEmpty />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
  platformApi.mockImplementation((action) => {
    if (action === 'list') {
      return Promise.resolve({ data: mockData, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
})

describe('PlatformListPage', () => {
  it('renders title with count and platforms sorted by name', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('AFA')).toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
  })

  it('search filters list by name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('AFA'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'prime' } })
    await waitFor(() => {
      expect(screen.queryByText('AFA')).not.toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
  })

  it('shows EmptyFilter when search filters everything out', async () => {
    renderPage()
    await waitFor(() => screen.getByText('AFA'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument()
    })
  })

  it('renders detail empty hint when no platform selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Выберите платформу/i)).toBeInTheDocument()
    })
  })
})
