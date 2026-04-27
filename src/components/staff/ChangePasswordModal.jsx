import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
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
    <ModalShell title="Сменить пароль" onClose={onClose}>
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
    </ModalShell>
  )
}

export function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
