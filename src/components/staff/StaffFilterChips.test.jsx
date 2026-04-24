import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StaffFilterChips } from './StaffFilterChips.jsx'

const counts = { all: 10, admin: 2, moderator: 4, teamlead: 1, operator: 3 }

describe('<StaffFilterChips>', () => {
  it('renders chip for each role with counts', () => {
    render(<StaffFilterChips counts={counts} value="all" onChange={() => {}} />)
    expect(screen.getByText(/Все · 10/)).toBeInTheDocument()
    expect(screen.getByText(/Админы · 2/)).toBeInTheDocument()
    expect(screen.getByText(/Модераторы · 4/)).toBeInTheDocument()
    expect(screen.getByText(/ТЛ · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Операторы · 3/)).toBeInTheDocument()
  })

  it('marks the active chip', () => {
    render(<StaffFilterChips counts={counts} value="moderator" onChange={() => {}} />)
    const active = screen.getByText(/Модераторы · 4/).closest('button')
    expect(active).toHaveAttribute('data-active', 'true')
  })

  it('calls onChange with role key on click', () => {
    const onChange = vi.fn()
    render(<StaffFilterChips counts={counts} value="all" onChange={onChange} />)
    fireEvent.click(screen.getByText(/Операторы · 3/))
    expect(onChange).toHaveBeenCalledWith('operator')
  })
})
