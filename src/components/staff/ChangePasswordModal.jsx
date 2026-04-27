import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ChangePasswordModal({ userId, onClose, onDone }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Пароль минимум 6 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('change_staff_password', {
      p_caller_id: user.id, p_user_id: userId, p_new_password: password,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone?.()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сменить пароль</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Новый пароль</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Повторите</span>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm text-[var(--danger-ink)]">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Сохранение…' : 'Сменить'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
