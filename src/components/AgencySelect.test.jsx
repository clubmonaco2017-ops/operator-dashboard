import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgencySelect from './AgencySelect.jsx'

const mockCtx = vi.fn()
vi.mock('../lib/agencyContext.jsx', () => ({
  useAgencyContext: () => mockCtx(),
}))

describe('AgencySelect', () => {
  beforeEach(() => {
    mockCtx.mockReset()
  })

  it('hides dropdown and auto-sets value when user has only one agency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'Solo' }],
      isMultiAgency: false,
    })
    const onChange = vi.fn()
    const { container } = render(<AgencySelect value={null} onChange={onChange} />)
    expect(container.querySelector('select')).toBeNull()
    expect(onChange).toHaveBeenCalledWith('a1')
  })

  it('does not call onChange when single-agency value already matches', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'Solo' }],
      isMultiAgency: false,
    })
    const onChange = vi.fn()
    render(<AgencySelect value="a1" onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders nothing when zero agencies', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [],
      isMultiAgency: false,
    })
    const { container } = render(<AgencySelect value={null} onChange={() => {}} />)
    expect(container.querySelector('select')).toBeNull()
  })

  it('renders dropdown when multi-agency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
      isMultiAgency: true,
    })
    render(<AgencySelect value="a1" onChange={() => {}} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument()
  })

  it('calls onChange with selected agency id', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
      isMultiAgency: true,
    })
    const onChange = vi.fn()
    render(<AgencySelect value="a1" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a2' } })
    expect(onChange).toHaveBeenCalledWith('a2')
  })

  it('passes empty string as null on placeholder selection', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
      isMultiAgency: true,
    })
    const onChange = vi.fn()
    render(<AgencySelect value="" onChange={onChange} required={false} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
