import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StaffList } from './StaffList.jsx'

const ROWS = [
  {
    id: 1,
    first_name: 'Иван',
    last_name: 'Петров',
    email: 'ivan@example.com',
    ref_code: 'OP-IPE-001',
    role: 'operator',
    is_active: true,
  },
  {
    id: 2,
    first_name: 'Анна',
    last_name: 'Смирнова',
    email: 'anna@example.com',
    ref_code: 'AD-ASM-002',
    role: 'admin',
    is_active: true,
  },
  {
    id: 3,
    first_name: 'Олег',
    last_name: 'Кузнецов',
    email: 'oleg@example.com',
    ref_code: 'TL-OKU-003',
    role: 'teamlead',
    is_active: false,
  },
]

function renderList(props) {
  return render(
    <MemoryRouter>
      <StaffList rows={ROWS} {...props} />
    </MemoryRouter>,
  )
}

describe('<StaffList>', () => {
  it('renders one row per staff member', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument()
    expect(screen.getByText('Олег Кузнецов')).toBeInTheDocument()
  })

  it('renders link with encoded refCode', () => {
    renderList({ selectedRefCode: null })
    const link = screen.getByText('Иван Петров').closest('a')
    expect(link).toHaveAttribute('href', '/staff/OP-IPE-001')
  })

  it('marks selected row with aria-current', () => {
    renderList({ selectedRefCode: 'AD-ASM-002' })
    const link = screen.getByText('Анна Смирнова').closest('a')
    expect(link).toHaveAttribute('aria-current', 'true')
  })

  it('renders role label badge', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('ОП')).toBeInTheDocument()
    expect(screen.getByText('Адм')).toBeInTheDocument()
    expect(screen.getByText('ТЛ')).toBeInTheDocument()
  })

  it('renders email and ref_code as subtitle', () => {
    renderList({ selectedRefCode: null })
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    expect(screen.getByText('OP-IPE-001')).toBeInTheDocument()
  })

  it('renders status dot with active aria-label', () => {
    renderList({ selectedRefCode: null })
    const activeDots = screen.getAllByLabelText('Активен')
    const inactiveDots = screen.getAllByLabelText('Неактивен')
    expect(activeDots).toHaveLength(2)
    expect(inactiveDots).toHaveLength(1)
  })

  it('renders empty list when rows is empty', () => {
    render(
      <MemoryRouter>
        <StaffList rows={[]} selectedRefCode={null} />
      </MemoryRouter>,
    )
    const items = screen.queryAllByRole('listitem')
    expect(items).toHaveLength(0)
  })
})
