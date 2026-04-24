import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionsTab } from './PermissionsTab.jsx'

function withRow(overrides = {}) {
  return {
    id: 42,
    role: 'admin',
    permissions: ['create_tasks'],
    ...overrides,
  }
}

describe('<PermissionsTab>', () => {
  it('shows checkboxes for every known permission', () => {
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={false}
        onToggle={() => {}}
      />,
    )
    // Sample known permissions (must match permissionGroups.js labels)
    expect(screen.getByLabelText('Создавать задачи')).toBeChecked()
    expect(screen.getByLabelText('Создавать сотрудников')).not.toBeChecked()
  })

  it('calls onToggle with key and next value', () => {
    const onToggle = vi.fn()
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={true}
        onToggle={onToggle}
      />,
    )
    const cb = screen.getByLabelText('Создавать сотрудников')
    fireEvent.click(cb)
    expect(onToggle).toHaveBeenCalledWith('create_users', true)
  })

  it('disables checkboxes when canEdit is false', () => {
    render(
      <PermissionsTab
        row={withRow()}
        canEdit={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByLabelText('Создавать задачи')).toBeDisabled()
  })
})
