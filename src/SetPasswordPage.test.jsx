import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SetPasswordPage from './SetPasswordPage';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}));

describe('SetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects passwords shorter than 8 chars', async () => {
    render(<MemoryRouter><SetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() => expect(screen.getByText(/не менее 8/i)).toBeInTheDocument());
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser with valid password and shows success', async () => {
    supabase.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    render(<MemoryRouter><SetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'longenoughpw' })
    );
  });

  it('shows error message when updateUser fails', async () => {
    supabase.auth.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'token expired' },
    });
    render(<MemoryRouter><SetPasswordPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /сохранить/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
    expect(screen.getByText(/ссылка могла истечь/i)).toBeInTheDocument();
  });
});
