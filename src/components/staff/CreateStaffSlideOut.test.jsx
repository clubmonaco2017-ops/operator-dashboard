import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateStaffSlideOut } from './CreateStaffSlideOut.jsx'

vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))
import { supabase } from '../../supabaseClient'

describe('<CreateStaffSlideOut>', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
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
    fireEvent.click(screen.getByTestId('create-staff-backdrop'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key', () => {
    const { props } = renderForm()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCreated with refCode on successful submit', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: 42, error: null }) // create_staff returns user_id
      .mockResolvedValueOnce({ data: [{ ref_code: 'OP-IPE-042' }], error: null }) // get_staff_detail
    const { props } = renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('OP-IPE-042'))
  })

  it('shows error alert on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'email уже занят' } })
    renderForm()
    fireEvent.change(screen.getByLabelText(/Имя/i), { target: { value: 'Иван' } })
    fireEvent.change(screen.getByLabelText(/Фамилия/i), { target: { value: 'Петров' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'i@example.com' } })
    fireEvent.change(screen.getByLabelText(/Пароль/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await screen.findByText(/email уже занят/)
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
})
