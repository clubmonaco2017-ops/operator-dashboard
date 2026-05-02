import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { DeletePlatformDialog } from './DeletePlatformDialog.jsx'
import { platformApi } from '../../lib/platforms.js'

const platform = { id: 'p-1', name: 'PRIME' }

beforeEach(() => {
  platformApi.mockReset()
})

describe('DeletePlatformDialog', () => {
  it('calls platformApi delete on confirm', async () => {
    platformApi.mockResolvedValueOnce({ data: { success: true }, error: null })
    const onDeleted = vi.fn()
    render(
      <DeletePlatformDialog platform={platform} onClose={() => {}} onDeleted={onDeleted} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Удалить/i }))
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('delete', { id: 'p-1' })
    })
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('shows FK error inline on REST failure', async () => {
    platformApi.mockResolvedValueOnce({
      data: null,
      error: { message: 'foreign key violation: agencies still reference this platform' },
    })
    render(
      <DeletePlatformDialog platform={platform} onClose={() => {}} onDeleted={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Удалить/i }))
    await waitFor(() => {
      expect(screen.getByText(/foreign key violation/i)).toBeInTheDocument()
    })
  })
})
