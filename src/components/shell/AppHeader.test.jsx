import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppHeader, useDerivedBreadcrumb } from './AppHeader.jsx'

function Probe({ path }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>
  )
}

describe('useDerivedBreadcrumb', () => {
  it('returns empty for /', () => {
    expect(useDerivedBreadcrumb('/')).toEqual([])
  })
  it('returns single crumb for /clients', () => {
    expect(useDerivedBreadcrumb('/clients')).toEqual([{ label: 'Клиенты' }])
  })
  it('returns single crumb for /clients/123', () => {
    expect(useDerivedBreadcrumb('/clients/123')).toEqual([{ label: 'Клиенты' }])
  })
  it('returns nested crumbs for /tasks/all/42', () => {
    expect(useDerivedBreadcrumb('/tasks/all/42')).toEqual([
      { label: 'Задачи', to: '/tasks' },
      { label: 'Все' },
    ])
  })
  it('returns nested crumbs for /tasks/outbox', () => {
    expect(useDerivedBreadcrumb('/tasks/outbox')).toEqual([
      { label: 'Задачи', to: '/tasks' },
      { label: 'Исходящие' },
    ])
  })
  it('returns nested crumbs for /staff/new', () => {
    expect(useDerivedBreadcrumb('/staff/new')).toEqual([
      { label: 'Сотрудники', to: '/staff' },
      { label: 'Новый' },
    ])
  })
  it('returns single crumb for /notifications', () => {
    expect(useDerivedBreadcrumb('/notifications')).toEqual([{ label: 'Оповещения' }])
  })
})

describe('<AppHeader>', () => {
  it('renders nothing in breadcrumb area on /', () => {
    render(<Probe path="/" />)
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
  })
  it('renders "Клиенты" crumb on /clients', () => {
    render(<Probe path="/clients" />)
    expect(screen.getByText('Клиенты')).toBeInTheDocument()
  })
  it('renders nested crumbs with separator on /tasks/all', () => {
    render(<Probe path="/tasks/all" />)
    expect(screen.getByText('Задачи')).toBeInTheDocument()
    expect(screen.getByText('Все')).toBeInTheDocument()
  })
})
