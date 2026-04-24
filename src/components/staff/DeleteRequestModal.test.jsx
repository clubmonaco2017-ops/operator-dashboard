import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteRequestModal } from './DeleteRequestModal.jsx'

describe('<DeleteRequestModal>', () => {
  it('disables submit until reason is 20+ chars', () => {
    render(
      <DeleteRequestModal
        targetUserId={5}
        targetName="Иван Петров"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    )
    const submit = screen.getByRole('button', { name: /Отправить/i })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Причина/i), { target: { value: 'short' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Причина/i), {
      target: { value: 'Достаточно длинная причина для отправки' },
    })
    expect(submit).not.toBeDisabled()
  })

  it('calls onSubmit with reason when submitted', () => {
    const onSubmit = vi.fn()
    render(
      <DeleteRequestModal
        targetUserId={5}
        targetName="Иван Петров"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByLabelText(/Причина/i), {
      target: { value: 'Сотрудник уволен, доступ больше не нужен' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }))
    expect(onSubmit).toHaveBeenCalledWith('Сотрудник уволен, доступ больше не нужен')
  })
})
