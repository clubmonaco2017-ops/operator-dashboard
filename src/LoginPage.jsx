import { useState } from 'react'
import { AlertCircle, BarChart3, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setError(null)
    setSubmitting(true)
    const result = await onLogin(email.trim(), password)
    if (!result.success) {
      setError(result.error || 'Ошибка авторизации')
    }
    setSubmitting(false)
  }

  const busy = submitting || loading

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 transition-colors">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <BarChart3 size={28} />
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
                disabled={busy}
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
                disabled={busy}
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

            <Button
              type="submit"
              disabled={busy}
              className="w-full"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1.5" />
                  Вход...
                </>
              ) : (
                'Войти'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
