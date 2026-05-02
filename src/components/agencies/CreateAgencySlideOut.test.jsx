import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

import { CreateAgencySlideOut } from './CreateAgencySlideOut.jsx'
import { supabase } from '../../supabaseClient.js'

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  // Mock platforms + admins fetch
  supabase.from.mockImplementation((table) => {
    if (table === 'platforms') {
      return {
        select: () => ({
          order: () =>
            Promise.resolve({
              data: [
                { id: 'p-1', name: 'PRIME' },
                { id: 'p-2', name: 'AFA' },
              ],
              error: null,
            }),
        }),
      }
    }
    if (table === 'dashboard_users') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 1, email: 'admin1@x.com', first_name: 'Иван', last_name: 'Иванов' },
                    { id: 2, email: 'admin2@x.com', first_name: null, last_name: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    }
    return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }
  })
})

function renderSlideOut(props = {}) {
  return render(
    <MemoryRouter>
      <CreateAgencySlideOut onClose={() => {}} onCreated={() => {}} {...props} />
    </MemoryRouter>,
  )
}

describe('CreateAgencySlideOut', () => {
  it('disables submit when name or platform empty', async () => {
    renderSlideOut()
    const btn = await screen.findByRole('button', { name: /Создать/i })
    expect(btn).toBeDisabled()
  })

  it('calls create_agency RPC and onCreated on submit', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: 'new-agency-uuid',
      error: null,
    })
    const onCreated = vi.fn()
    renderSlideOut({ onCreated })
    fireEvent.change(await screen.findByLabelText(/Название/i), {
      target: { value: 'New Agency' },
    })
    fireEvent.change(await screen.findByLabelText(/Платформа/i), {
      target: { value: 'p-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_agency', expect.objectContaining({
        p_name: 'New Agency',
        p_platform_id: 'p-1',
        p_admin_ids: [],
      }))
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('shows error inline on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'уже существует' } })
    renderSlideOut()
    fireEvent.change(await screen.findByLabelText(/Название/i), {
      target: { value: 'Duplicate' },
    })
    fireEvent.change(await screen.findByLabelText(/Платформа/i), {
      target: { value: 'p-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByText(/уже существует/)).toBeInTheDocument()
    })
  })
})
