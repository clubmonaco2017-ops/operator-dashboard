import { useEffect, useRef, useState } from 'react'
import { Pencil, Lock, Loader2 } from 'lucide-react'
import { useClientActions } from '../../hooks/useClientActions.js'
import { usePlatforms } from '../../hooks/usePlatforms.js'
import { useAgencies } from '../../hooks/useAgencies.js'
import { validateAlias, validateName, validateTableauId, formatFileSize } from '../../lib/clients.js'

/**
 * Контент таба «Профиль» — три карточки: Описание, Поля профиля, Файлы профиля.
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {object} props.client — row из get_client_detail
 * @param {function} props.onChanged — вызывается после сохранения для refetch
 */
export function ProfileTab({ callerId, client, onChanged }) {
  return (
    <div className="space-y-4">
      <DescriptionCard callerId={callerId} client={client} onChanged={onChanged} />
      <ProfileFieldsCard callerId={callerId} client={client} onChanged={onChanged} />
      <ProfileFilesCard callerId={callerId} client={client} onChanged={onChanged} />
    </div>
  )
}

// ============================================================================
// Card: Описание
// ============================================================================

function DescriptionCard({ callerId, client, onChanged }) {
  const { updateClient } = useClientActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(client.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setDraft(client.description ?? '')
  }, [client.description])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  async function save() {
    const next = draft.trim()
    const cur = (client.description ?? '').trim()
    if (next === cur) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateClient(client.id, {
        description: next || null,
        clearDescription: next === '' && cur !== '',
      })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Описание"
        action={
          !editing && (
            <IconButton onClick={() => setEditing(true)} aria-label="Редактировать описание">
              <Pencil size={14} />
            </IconButton>
          )
        }
      />
      {editing ? (
        <div>
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            rows={4}
            placeholder="Контент, аудитория, особенности тона…"
            className={inputCls(false) + ' resize-y'}
          />
          {error && <FieldError message={error} />}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(client.description ?? '')
                setEditing(false)
                setError(null)
              }}
              disabled={saving}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : client.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--fg2)]">
          {client.description}
        </p>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">
          Без описания. Нажмите карандаш чтобы добавить.
        </p>
      )}
    </Card>
  )
}

// ============================================================================
// Card: Поля профиля
// ============================================================================

function ProfileFieldsCard({ callerId, client, onChanged }) {
  const { updateClient } = useClientActions(callerId)
  const { rows: platforms } = usePlatforms()
  const { rows: agencies } = useAgencies({ platformId: client.platform_id })

  return (
    <Card>
      <CardHeader title="Поля профиля" />
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <InlineTextField
          label="Name"
          required
          value={client.name}
          validate={(v) => validateName(v)}
          onSave={(next) => updateClient(client.id, { name: next })}
          onChanged={onChanged}
        />
        <InlineTextField
          label="Alias"
          value={client.alias}
          validate={(v) => validateAlias(v)}
          placeholder="@username"
          onSave={(next) => updateClient(client.id, { alias: next || null, clearAlias: !next })}
          onChanged={onChanged}
        />
        <InlineSelectField
          label="Platform"
          required
          value={client.platform_id}
          options={platforms.map((p) => ({ value: p.id, label: p.name }))}
          onSave={(next) => updateClient(client.id, { platformId: next })}
          onChanged={onChanged}
        />
        <InlineSelectField
          label="Agency"
          required
          value={client.agency_id}
          options={agencies.map((a) => ({ value: a.id, label: a.name }))}
          onSave={(next) => updateClient(client.id, { agencyId: next })}
          onChanged={onChanged}
        />
        <div className="md:col-span-2">
          <InlineTextField
            label="Tableau ID"
            value={client.tableau_id}
            placeholder="например, TBL-2351"
            mono
            iconLeft={<Lock size={12} />}
            hint="read-only · из Tableau"
            validate={(v) => validateTableauId(v)}
            onSave={(next) => updateClient(client.id, { tableauId: next || null, clearTableauId: !next })}
            onChanged={onChanged}
          />
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// Card: Файлы профиля (avatar)
// ============================================================================

function ProfileFilesCard({ callerId, client, onChanged }) {
  return (
    <Card>
      <CardHeader title="Файлы профиля" />
      {client.avatar_url ? (
        <div className="flex items-center gap-4 rounded-lg border border-border p-3">
          <img src={client.avatar_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              avatar
            </p>
            <p className="text-xs text-muted-foreground">
              Не попадает в фото-галерею
            </p>
          </div>
          <button
            type="button"
            onClick={() => alert('Замена аватара — Stage 8')}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-[var(--primary-soft)] focus-ds"
          >
            Заменить
          </button>
        </div>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">
          Аватар не загружен.
        </p>
      )}
    </Card>
  )
}

// ============================================================================
// Inline-edit primitives
// ============================================================================

function InlineTextField({ label, required, value, validate, placeholder, mono, iconLeft, hint, onSave, onChanged }) {
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  async function commit() {
    const next = draft.trim()
    const cur = (value ?? '').trim()
    if (next === cur) {
      setEditing(false)
      setError(null)
      return
    }
    if (validate) {
      const v = validate(next)
      if (!v.valid) {
        setError(v.error)
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(value ?? '')
    setEditing(false)
    setError(null)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  return (
    <FieldShell label={label} required={required} hint={!error ? hint : null} error={error}>
      <div className="relative">
        {iconLeft && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setEditing(true)}
          onBlur={() => editing && commit()}
          onKeyDown={onKeyDown}
          disabled={saving}
          placeholder={placeholder}
          className={[
            inputCls(!!error),
            iconLeft && 'pl-8',
            mono && 'font-mono',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {saving && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-600">
            <Loader2 size={12} className="animate-spin" />
          </span>
        )}
      </div>
    </FieldShell>
  )
}

function InlineSelectField({ label, required, value, options, onSave, onChanged }) {
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  async function onChange(e) {
    const next = e.target.value
    setDraft(next)
    if (next === (value ?? '')) return
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      onChanged?.()
    } catch (err) {
      setError(err.message)
      setDraft(value ?? '')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FieldShell label={label} required={required} error={error}>
      <div className="relative">
        <select value={draft} onChange={onChange} disabled={saving} className={inputCls(!!error) + ' cursor-pointer'}>
          <option value="">— не указано —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {saving && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 text-blue-600">
            <Loader2 size={12} className="animate-spin" />
          </span>
        )}
      </div>
    </FieldShell>
  )
}

function FieldShell({ label, required, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block label-caps">
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>}
      </span>
      {children}
      {error ? (
        <FieldError message={error} />
      ) : hint ? (
        <span className="mt-1 block text-xs text-[var(--fg4)]">{hint}</span>
      ) : null}
    </label>
  )
}

function FieldError({ message }) {
  return (
    <span className="mt-1 block text-xs text-[var(--danger-ink)]" role="alert">
      {message}
    </span>
  )
}

// ============================================================================
// Card primitives
// ============================================================================

function Card({ children }) {
  return (
    <section className="surface-card p-5">
      {children}
    </section>
  )
}

function CardHeader({ title, action }) {
  return (
    <header className="mb-3 flex items-center justify-between">
      <h3 className="label-caps">
        {title}
      </h3>
      {action}
    </header>
  )
}

function IconButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground focus-ds"
      {...props}
    >
      {children}
    </button>
  )
}

// ============================================================================
// Helpers + icons
// ============================================================================

function inputCls(hasError) {
  return [
    'w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none transition-colors text-foreground',
    'placeholder:text-[var(--fg4)]',
    hasError
      ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-2 focus:ring-[var(--danger)]/25'
      : 'border-border hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]',
    'disabled:bg-muted disabled:opacity-70',
  ].join(' ')
}

