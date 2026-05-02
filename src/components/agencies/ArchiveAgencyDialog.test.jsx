import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { ArchiveAgencyDialog } from './ArchiveAgencyDialog.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = { id: 'a-1', name: 'Test Agency' }

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('ArchiveAgencyDialog', () => {
  it('calls archive_agency RPC on confirm', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    const onArchived = vi.fn()
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={onArchived} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Архивировать/i }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('archive_agency', { p_agency_id: 'a-1' })
    })
    await waitFor(() => expect(onArchived).toHaveBeenCalled())
  })

  it('shows error inline on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: { message: 'у агентства есть активные клиенты' } })
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Архивировать/i }))
    await waitFor(() => {
      expect(screen.getByText(/активные клиенты/i)).toBeInTheDocument()
    })
  })

  it('renders agency name in description', () => {
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={() => {}} />,
    )
    expect(screen.getByText(/Test Agency/)).toBeInTheDocument()
  })
})
