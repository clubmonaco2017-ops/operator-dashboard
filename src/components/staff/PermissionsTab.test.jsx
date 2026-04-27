import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PermissionsTab } from './PermissionsTab.jsx'

// Mock useOutletContext so PermissionsTab can be rendered outside a router
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOutletContext: vi.fn(),
  }
})

import { useOutletContext } from 'react-router-dom'

// Mock supabase so onToggle RPC calls don't hit the network
vi.mock('../../supabaseClient', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ error: null }),
  },
}))

import { supabase } from '../../supabaseClient'

function makeContext({ permissions = [], canManageRoles = false, onChanged = vi.fn() } = {}) {
  return {
    row: { id: 42, role: 'admin', permissions },
    user: {
      id: 1,
      role: 'admin',
      permissions: canManageRoles ? ['manage_roles'] : [],
    },
    onChanged,
  }
}

describe('<PermissionsTab>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows checkboxes for every known permission', () => {
    useOutletContext.mockReturnValue(
      makeContext({ permissions: ['create_tasks'] }),
    )
    render(<PermissionsTab />)
    // Sample known permissions (must match permissionGroups.js labels)
    expect(screen.getByLabelText('Создавать задачи')).toBeChecked()
    expect(screen.getByLabelText('Создавать сотрудников')).not.toBeChecked()
  })

  it('calls supabase RPC with key and next value', async () => {
    const onChanged = vi.fn()
    useOutletContext.mockReturnValue(
      makeContext({ permissions: ['create_tasks'], canManageRoles: true, onChanged }),
    )
    render(<PermissionsTab />)
    const cb = screen.getByLabelText('Создавать сотрудников')
    fireEvent.click(cb)
    // Let the async onToggle settle
    await vi.waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('grant_permission', expect.objectContaining({
        p_permission: 'create_users',
      }))
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('disables checkboxes when canEdit is false', () => {
    useOutletContext.mockReturnValue(
      makeContext({ permissions: ['create_tasks'], canManageRoles: false }),
    )
    render(<PermissionsTab />)
    expect(screen.getByLabelText('Создавать задачи')).toBeDisabled()
  })
})
