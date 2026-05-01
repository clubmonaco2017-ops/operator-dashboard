import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AgencySwitcher from './AgencySwitcher.jsx'

const mockCtx = vi.fn()
vi.mock('../lib/agencyContext.jsx', () => ({
  useAgencyContext: () => mockCtx(),
}))

describe('AgencySwitcher', () => {
  beforeEach(() => {
    mockCtx.mockReset()
  })

  it('renders nothing when user has 0 agencies', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [],
      activeAgencyId: null,
      activeAgency: null,
      isMultiAgency: false,
      setActiveAgency: vi.fn(),
    })
    const { container } = render(<AgencySwitcher />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when user has only 1 agency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [{ id: 'a1', name: 'Agency Alpha' }],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: false,
      setActiveAgency: vi.fn(),
    })
    const { container } = render(<AgencySwitcher />)
    expect(container.firstChild).toBeNull()
  })

  it('renders dropdown with active agency name when multi-agency', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Agency Alpha' },
        { id: 'a2', name: 'Agency Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: true,
      setActiveAgency: vi.fn(),
    })
    render(<AgencySwitcher />)
    expect(
      screen.getByRole('button', { name: /Agency Alpha/i }),
    ).toBeInTheDocument()
  })

  it('opens menu on click and lists all agencies', () => {
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Agency Alpha' },
        { id: 'a2', name: 'Agency Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: true,
      setActiveAgency: vi.fn(),
    })
    render(<AgencySwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /Agency Alpha/i }))
    expect(screen.getByRole('menuitem', { name: /Agency Alpha/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Agency Beta/i })).toBeInTheDocument()
  })

  it('calls setActiveAgency when option clicked and closes menu', () => {
    const setActive = vi.fn()
    mockCtx.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Agency Alpha' },
        { id: 'a2', name: 'Agency Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Agency Alpha' },
      isMultiAgency: true,
      setActiveAgency: setActive,
    })
    render(<AgencySwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /Agency Alpha/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Agency Beta/i }))
    expect(setActive).toHaveBeenCalledWith('a2')
    // menu collapsed after click
    expect(screen.queryByRole('menuitem', { name: /Agency Beta/i })).toBeNull()
  })
})
