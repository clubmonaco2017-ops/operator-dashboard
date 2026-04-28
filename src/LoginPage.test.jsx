import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// vi.hoisted ensures these are available when vi.mock factories run (which are hoisted above imports).
const { mockSignIn, mockResetPassword } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockResetPassword: vi.fn(),
}))

vi.mock('./useAuth.jsx', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
  }),
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPassword,
    },
  },
}))

import LoginPage from './LoginPage.jsx'

beforeEach(() => {
  vi.clearAllMocks()
  mockSignIn.mockResolvedValue({ error: null })
  mockResetPassword.mockResolvedValue({ error: null })
})

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function renderPage() {
  return render(<LoginPage />)
}

function fillEmail(email = 'user@example.com') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
}

function fillForm(email = 'user@example.com', password = 'secret') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: password } })
}

function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: /войти/i }).closest('form'))
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('<LoginPage>', () => {
  it('renders the login form with email, password inputs and submit button', () => {
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /забыли пароль/i })).toBeInTheDocument()
  })

  it('calls signIn with email and password on submit', async () => {
    renderPage()
    fillForm('user@example.com', 'mypassword')
    submitForm()
    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'mypassword')
    )
  })

  it('shows no error on successful sign-in', async () => {
    renderPage()
    fillForm()
    submitForm()
    await waitFor(() => expect(mockSignIn).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows Russian error for invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })
    renderPage()
    fillForm()
    submitForm()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Неверный email или пароль')
    )
  })

  it('shows Russian error for unconfirmed email', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } })
    renderPage()
    fillForm()
    submitForm()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Email не подтверждён')
    )
  })

  it('shows generic Russian error for unknown errors', async () => {
    mockSignIn.mockResolvedValue({ error: { code: 'unexpected_failure', message: 'Network error' } })
    renderPage()
    fillForm()
    submitForm()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Ошибка входа. Попробуйте позже.')
    )
  })

  describe('forgot password', () => {
    it('shows error if email is empty when clicking forgot-password', async () => {
      renderPage()
      // do not fill email
      fireEvent.click(screen.getByRole('button', { name: /забыли пароль/i }))
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Введите email')
      )
      expect(mockResetPassword).not.toHaveBeenCalled()
    })

    it('calls resetPasswordForEmail and shows notice on success', async () => {
      renderPage()
      fillEmail('user@example.com')
      fireEvent.click(screen.getByRole('button', { name: /забыли пароль/i }))
      await waitFor(() =>
        expect(mockResetPassword).toHaveBeenCalledWith('user@example.com', {
          redirectTo: expect.stringContaining('/set-password'),
        })
      )
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('user@example.com')
      )
    })

    it('shows error if resetPasswordForEmail fails', async () => {
      mockResetPassword.mockResolvedValue({ error: { message: 'Something went wrong' } })
      renderPage()
      fillEmail('user@example.com')
      fireEvent.click(screen.getByRole('button', { name: /забыли пароль/i }))
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отправить письмо')
      )
    })
  })

  it('disables forgot-password button while sign-in is submitting', async () => {
    // Make signIn hang so we can observe the submitting state.
    let resolve
    mockSignIn.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderPage()
    fillForm('a@b.c', 'pw')
    fireEvent.click(screen.getByRole('button', { name: /войти/i }))
    // Now submitting=true. Forgot-password button should be disabled.
    const forgot = screen.getByRole('button', { name: /забыли пароль/i })
    expect(forgot).toBeDisabled()
    resolve({ error: null })
  })
})
