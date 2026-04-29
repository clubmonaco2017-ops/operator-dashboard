import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Sends a password-reset link to a staff member's email via Supabase Auth.
 *
 * Previously: admin entered a new password → change_staff_password RPC →
 *   dashboard_users.password_hash updated (deprecated, auth_login dropped in Stage 14).
 *
 * Now: admin clicks "Отправить ссылку" → supabase.auth.resetPasswordForEmail →
 *   staff member receives email → clicks link → lands on /set-password → sets own password.
 *
 * Props:
 *   staffEmail {string} — the staff member's email address
 *   onClose    {() => void}
 */
export function ChangePasswordModal({ staffEmail, onClose }) {
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!staffEmail?.trim()) {
      setError('У сотрудника не указан email — невозможно отправить ссылку')
      return
    }
    setSubmitting(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(staffEmail, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setSent(true)
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отправить ссылку для сброса пароля</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="space-y-4">
            <p role="status" className="text-sm text-foreground">
              Письмо отправлено на{' '}
              <span className="font-medium">{staffEmail}</span>.
              Сотрудник должен перейти по ссылке в письме, чтобы установить новый пароль.
            </p>
            <Button onClick={onClose} className="w-full">
              Закрыть
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Сотрудник получит письмо на адрес{' '}
              <span className="font-medium text-foreground">{staffEmail}</span>{' '}
              со ссылкой для установки нового пароля.
            </p>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger-ink)]">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Отправка…' : 'Отправить ссылку'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
