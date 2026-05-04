import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateStaffSlideOut } from './CreateStaffSlideOut.jsx'

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))
vi.mock('../../lib/adminFetch', () => ({
  adminFetch: vi.fn(),
}))
const agencyMock = vi.fn(() => ({
  availableAgencies: [{ id: 'agency-x', name: 'Test Agency' }],
  activeAgencyId: 'agency-x',
  activeAgency: { id: 'agency-x', name: 'Test Agency' },
  setActiveAgency: vi.fn(),
  isMultiAgency: false,
}))
vi.mock('../../lib/agencyContext.jsx', () => ({
  useAgencyContext: () => agencyMock(),
}))
import { supabase } from '../../supabaseClient'
import { adminFetch } from '../../lib/adminFetch'

const SINGLE_AGENCY_CTX = {
  availableAgencies: [{ id: 'agency-x', name: 'Test Agency' }],
  activeAgencyId: 'agency-x',
  activeAgency: { id: 'agency-x', name: 'Test Agency' },
  setActiveAgency: vi.fn(),
  isMultiAgency: false,
}

describe('<CreateStaffSlideOut>', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
    adminFetch.mockReset()
    agencyMock.mockReset()
    agencyMock.mockReturnValue(SINGLE_AGENCY_CTX)
  })

  function renderForm(overrides = {}) {
    const props = {
      callerId: 'caller-1',
      onClose: vi.fn(),
      onCreated: vi.fn(),
      ...overrides,
    }
    return { ...render(<CreateStaffSlideOut {...props} />), props }
  }

  it('disables submit button when form is incomplete', () => {
    renderForm()
    const submit = screen.getByRole('button', { name: /Создать/i })
    expect(submit).toBeDisabled()
  })

  it('enables submit when all required fields are filled', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    expect(screen.getByRole('button', { name: /Создать/i })).not.toBeDisabled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const { props } = renderForm()
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    fireEvent.click(overlay)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key', () => {
    const { props } = renderForm()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCreated with refCode on successful submit', async () => {
    adminFetch.mockResolvedValueOnce({ data: { id: 42 }, error: null })
    supabase.rpc.mockResolvedValueOnce({
      data: [{ out_ref_code: 'OP-IPE-042' }],
      error: null,
    })
    const { props } = renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('OP-IPE-042'))
  })

  it('shows error alert on RPC failure', async () => {
    adminFetch.mockResolvedValueOnce({
      data: null,
      error: { message: 'email already exists' },
    })
    renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await screen.findByText(/Этот email уже используется/)
  })

  it('translates 23502 agency_id required error to Russian', async () => {
    adminFetch.mockResolvedValueOnce({
      data: null,
      error: { message: 'agency_id is required for role operator' },
    })
    renderForm()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'operator' } })
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await screen.findByText(/Не выбрано агентство для этой роли/)
  })

  it('resets permissions when role changes', () => {
    renderForm()
    // The role select is the only <select> (combobox) in the form
    const roleSelect = screen.getByRole('combobox')
    // По умолчанию роль 'moderator' — у неё есть view_team_revenue в дефолтных правах.
    const teamRevenue = screen.getByLabelText(/Выручка команды/i)
    expect(teamRevenue).toBeChecked()
    // Меняем на operator — у operator нет view_team_revenue в дефолтах
    fireEvent.change(roleSelect, { target: { value: 'operator' } })
    // view_team_revenue должен сброситься
    expect(teamRevenue).not.toBeChecked()
  })

  it('toggles permission checkbox independently of role', () => {
    renderForm()
    const createUsers = screen.getByLabelText(/Создавать сотрудников/i)
    const initial = createUsers.checked
    fireEvent.click(createUsers)
    expect(createUsers.checked).toBe(!initial)
  })

  it('renders admin multi-select with all available agencies for admin role (multi-agency caller)', () => {
    agencyMock.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
        { id: 'a3', name: 'Gamma' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Alpha' },
      setActiveAgency: vi.fn(),
      isMultiAgency: true,
    })
    renderForm()
    const roleSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(roleSelect, { target: { value: 'admin' } })
    expect(screen.getByLabelText('Alpha')).toBeInTheDocument()
    expect(screen.getByLabelText('Beta')).toBeInTheDocument()
    expect(screen.getByLabelText('Gamma')).toBeInTheDocument()
  })

  it('submits create_staff with p_admin_agency_ids array when role is admin', async () => {
    agencyMock.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
      activeAgencyId: 'a1',
      activeAgency: { id: 'a1', name: 'Alpha' },
      setActiveAgency: vi.fn(),
      isMultiAgency: true,
    })
    adminFetch.mockResolvedValueOnce({ data: { id: 99 }, error: null })
    supabase.rpc.mockResolvedValueOnce({
      data: [{ out_ref_code: 'AD-IPE-099' }],
      error: null,
    })
    renderForm()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'admin' } })
    // toggle Beta on (Alpha already preselected from activeAgencyId)
    fireEvent.click(screen.getByLabelText('Beta'))
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => expect(adminFetch).toHaveBeenCalled())
    const [path, args] = adminFetch.mock.calls[0]
    expect(path).toBe('/api/admin/create-staff')
    expect(args.p_role).toBe('admin')
    expect(args.p_agency_id).toBeNull()
    expect(args.p_admin_agency_ids).toEqual(expect.arrayContaining(['a1', 'a2']))
  })

  it('disables submit for admin role when no agencies are selected', () => {
    agencyMock.mockReturnValue({
      availableAgencies: [
        { id: 'a1', name: 'Alpha' },
        { id: 'a2', name: 'Beta' },
      ],
      activeAgencyId: null,
      activeAgency: null,
      setActiveAgency: vi.fn(),
      isMultiAgency: true,
    })
    renderForm()
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'И' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'П' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    expect(screen.getByRole('button', { name: /Создать/i })).toBeDisabled()
  })
})
