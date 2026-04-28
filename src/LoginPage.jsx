import { useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from './useAuth.jsx'
import { supabase } from './supabaseClient'

function Logo() {
  return (
    <svg
      width="40"
      height="29"
      viewBox="0 0 40 29"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M34.4594 28.9839H33.1054L40 20.9489V22.5269L34.4594 28.9839ZM40 16.553H38.7427L29.3471 27.5025V28.9678H29.4439L40 16.6657V16.553ZM40 19.5963V18.0183L30.5907 28.9839H31.9447L40 19.5963ZM38.1209 28.9839H40V26.794L38.1209 28.9839ZM40 25.4575V23.8795L35.6062 29H36.9603L39.9862 25.4736L40 25.4575ZM34.0311 13.6224C36.9741 12.0444 39.8756 11.8512 39.8756 11.8512V0C30.5354 0.998334 23.9862 5.36202 19.5924 12.0122H19.3575L24.677 0H12.7254L0 28.9839H11.7997L16.3178 18.8234H16.5527V28.9839H24.6218L28.228 20.5303C28.4214 19.9989 28.6287 19.4997 28.8774 19.0167L28.9879 18.7751H29.0017C29.1123 18.5658 29.2366 18.3726 29.3471 18.1632V26.1821L37.5959 16.5691H30.4111H30.3834C30.6321 16.2632 30.8946 15.9895 31.171 15.7157C32.0276 14.8462 32.981 14.1377 34.0311 13.6385V13.6224Z"
        fill="#2563EB"
      />
    </svg>
  )
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      if (signInError.message?.includes('Invalid login credentials')) {
        setError('Неверный email или пароль')
      } else if (signInError.message?.includes('Email not confirmed')) {
        setError('Email не подтверждён. Проверьте почту.')
      } else {
        setError('Ошибка входа. Попробуйте позже.')
      }
      return
    }
    // session set by AuthProvider; navigation happens via auth-aware Router (App.jsx).
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 transition-colors">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Дашборд операторов</h1>
          <p className="text-sm text-muted-foreground mt-1">Войдите в свой аккаунт</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide"
              >
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={submitting}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide"
              >
                Пароль
              </label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={submitting}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-[var(--danger-soft)] border border-[var(--danger-strong)] rounded-xl px-4 py-3"
              >
                <AlertCircle
                  size={16}
                  className="text-[var(--danger-ink)] flex-shrink-0 mt-0.5"
                />
                <p className="text-sm text-[var(--danger-ink)]">{error}</p>
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="flex items-start gap-2.5 bg-[var(--success-soft,hsl(var(--muted)))] border border-[var(--success-strong,hsl(var(--border)))] rounded-xl px-4 py-3"
              >
                <p className="text-sm text-foreground">{notice}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1.5" />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </Button>

            <div className="flex justify-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground transition"
                onClick={async () => {
                  if (!email) {
                    setError('Введите email, чтобы получить ссылку для сброса.')
                    return
                  }
                  setError('')
                  setNotice('')
                  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/set-password`,
                  })
                  if (resetErr) {
                    setError('Не удалось отправить письмо. Попробуйте позже.')
                  } else {
                    setNotice('Письмо со ссылкой отправлено на ' + email)
                  }
                }}
              >
                Забыли пароль?
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
