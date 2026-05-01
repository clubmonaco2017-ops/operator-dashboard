import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgencyFilterDropdown from './AgencyFilterDropdown.jsx'

const mockCtx = vi.fn()
vi.mock('../lib/agencyContext.jsx', () => ({
  useAgencyContext: () => mockCtx(),
}))

describe('AgencyFilterDropdown', () => {
  beforeEach(() => {
    mockCtx.mockReset()
  })

  it('renders nothing when single-agency', () => {
    mockCtx.mockReturnValue({
      isMultiAgency: false,
      availableAgencies: [{ id: 'a1', name: 'Solo' }],
    })
    const { container } = render(
      <AgencyFilterDropdown value={null} onChange={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dropdown with "Все агентства" option when multi-agency', () => {
    mockCtx.mockReturnValue({
      isMultiAgency: true,
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
    })
    render(<AgencyFilterDropdown value={null} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Все агентства' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument()
  })

  it('calls onChange(null) when "Все агентства" selected', () => {
    mockCtx.mockReturnValue({
      isMultiAgency: true,
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
    })
    const onChange = vi.fn()
    render(<AgencyFilterDropdown value="a1" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('calls onChange with agency id when narrowing', () => {
    mockCtx.mockReturnValue({
      isMultiAgency: true,
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
    })
    const onChange = vi.fn()
    render(<AgencyFilterDropdown value={null} onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a2' } })
    expect(onChange).toHaveBeenCalledWith('a2')
  })
})
