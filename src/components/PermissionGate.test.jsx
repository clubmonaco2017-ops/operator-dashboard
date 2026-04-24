import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PermissionGate } from './PermissionGate.jsx'

describe('<PermissionGate>', () => {
  const sa = { role: 'superadmin' }
  const admin = { role: 'admin', permissions: ['create_tasks'] }
  const op = { role: 'operator', permissions: ['view_own_revenue'] }

  it('renders children when user has permission', () => {
    render(
      <PermissionGate user={admin} permission="create_tasks">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('renders nothing when user lacks permission', () => {
    render(
      <PermissionGate user={op} permission="create_tasks">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.queryByText('OK')).toBeNull()
  })

  it('renders fallback if provided and lacks permission', () => {
    render(
      <PermissionGate user={op} permission="create_tasks" fallback={<span>NO</span>}>
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('NO')).toBeInTheDocument()
    expect(screen.queryByText('OK')).toBeNull()
  })

  it('superadmin sees everything', () => {
    render(
      <PermissionGate user={sa} permission="anything_at_all">
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('accepts any of permissions array', () => {
    render(
      <PermissionGate user={admin} anyOf={['manage_roles', 'create_tasks']}>
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('anyOf renders nothing if user has none', () => {
    render(
      <PermissionGate user={op} anyOf={['manage_roles', 'create_tasks']}>
        <span>OK</span>
      </PermissionGate>,
    )
    expect(screen.queryByText('OK')).toBeNull()
  })
})
