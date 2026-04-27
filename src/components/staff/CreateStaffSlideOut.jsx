import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { defaultPermissions } from '../../lib/defaultPermissions.js'
import { permissionGroups } from '../../lib/permissionGroups.js'
import { RefCodePreview } from './RefCodePreview.jsx'

const ROLES = [
  { value: 'admin',     label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'teamlead',  label: 'Тим Лидер' },
  { value: 'operator',  label: 'Оператор' },
]

export function CreateStaffSlideOut({ callerId, onClose, onCreated }) {
  const [role, setRole] = useState('moderator')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => new Set(defaultPermissions('moderator')))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const firstNameRef = useRef(null)

  useEffect(() => {
    firstNameRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  function setRoleAndPerms(r) {
    setRole(r)
    setPerms(new Set(defaultPermissions(r)))
  }

  function togglePerm(key) {
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const canSubmit = useMemo(() => {
    return (
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.length >= 6
    )
  }, [firstName, lastName, email, password])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    const { data: newId, error: rpcError } = await supabase.rpc('create_staff', {
      p_caller_id: callerId,
      p_email: email.trim(),
      p_password: password,
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_permissions: Array.from(perms),
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    const { data: detail, error: detailErr } = await supabase.rpc('get_staff_detail', {
      p_caller_id: callerId,
      p_user_id: newId,
    })
    if (detailErr || !detail?.[0]) {
      setError(detailErr?.message ?? 'Создано, но не удалось открыть карточку')
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    onCreated?.(detail[0].ref_code)
  }

  return (
    <>
      <div
        data-testid="create-staff-backdrop"
        className="fixed inset-0 z-50 bg-black/40"
        onClick={() => !submitting && onClose()}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-staff-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-card shadow-2xl border-l border-border"
      >
        <header className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 id="create-staff-title" className="text-lg font-bold text-foreground">
              Новый сотрудник
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Поля со звёздочкой обязательны
            </p>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Закрыть форму создания сотрудника"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            <Field label="Роль" required>
              <select
                value={role}
                onChange={(e) => setRoleAndPerms(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Реф-код (предпросмотр)
              </div>
              <RefCodePreview role={role} firstName={firstName} lastName={lastName} />
            </div>

            <Field label="Имя" required>
              <input
                ref={firstNameRef}
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Фамилия" required>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Псевдоним">
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Email" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className={inputCls()}
              />
            </Field>

            <Field label="Пароль" required hint="Минимум 6 символов">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                minLength={6}
                className={inputCls()}
              />
            </Field>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Права (по умолчанию для роли, можно менять)
              </div>
              <div className="space-y-2">
                {permissionGroups.map((g) => (
                  <details key={g.title} open className="rounded-md border border-border bg-card">
                    <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.title}
                    </summary>
                    <div className="space-y-1 border-t border-border px-3 py-2">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={perms.has(p.key)}
                            onChange={() => togglePerm(p.key)}
                            disabled={submitting}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
                          />
                          <span className="text-foreground">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>

          <footer className="border-t border-border bg-muted/40 px-6 py-4">
            {error && (
              <p
                className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                role="alert"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                disabled={submitting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-1.5" /> Создаётся…
                  </>
                ) : (
                  'Создать'
                )}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--fg4)]">{hint}</span>}
    </label>
  )
}

function inputCls() {
  return [
    'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors text-foreground',
    'placeholder:text-[var(--fg4)]',
    'hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]',
    'disabled:bg-muted disabled:opacity-60',
  ].join(' ')
}
