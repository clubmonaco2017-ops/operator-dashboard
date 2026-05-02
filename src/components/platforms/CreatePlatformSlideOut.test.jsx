import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { CreatePlatformSlideOut } from './CreatePlatformSlideOut.jsx'
import { platformApi } from '../../lib/platforms.js'

beforeEach(() => {
  platformApi.mockReset()
})

function renderSlideOut(props = {}) {
  return render(
    <MemoryRouter>
      <CreatePlatformSlideOut onClose={() => {}} onCreated={() => {}} {...props} />
    </MemoryRouter>,
  )
}

describe('CreatePlatformSlideOut', () => {
  it('disables submit when name empty', () => {
    renderSlideOut()
    const btn = screen.getByRole('button', { name: /Создать/i })
    expect(btn).toBeDisabled()
  })

  it('calls platformApi create with correct payload on submit', async () => {
    platformApi.mockResolvedValueOnce({
      data: { id: 'new-platform-uuid', name: 'New Platform' },
      error: null,
    })
    const onCreated = vi.fn()
    renderSlideOut({ onCreated })
    fireEvent.change(screen.getByLabelText(/Название/i), {
      target: { value: 'New Platform' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('create', {
        name: 'New Platform',
        logo_url: null,
        contacts: [],
        access_login: null,
        access_password: null,
        notes: null,
      })
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-platform-uuid'))
  })

  it('shows error inline on REST failure', async () => {
    platformApi.mockResolvedValueOnce({ data: null, error: { message: 'duplicate name' } })
    renderSlideOut()
    fireEvent.change(screen.getByLabelText(/Название/i), {
      target: { value: 'Dup' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByText(/duplicate name/)).toBeInTheDocument()
    })
  })
})
