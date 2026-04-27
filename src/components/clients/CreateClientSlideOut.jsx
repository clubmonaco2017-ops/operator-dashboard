import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Link as LinkIcon, Image as ImageIcon, Upload, Loader2, Check } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useClientActions } from '../../hooks/useClientActions.js'
import { usePlatforms } from '../../hooks/usePlatforms.js'
import { useAgencies } from '../../hooks/useAgencies.js'
import {
  validateName,
  validateAlias,
  validateTableauId,
  validateFile,
  formatFileSize,
  FILE_LIMITS,
} from '../../lib/clients.js'
import { CreateClientCloseConfirm } from './CreateClientCloseConfirm.jsx'
import { Button } from '@/components/ui/button'

const EMPTY_FORM = {
  name: '',
  alias: '',
  description: '',
  platformId: '',
  agencyId: '',
  tableauId: '',
}

/**
 * Slide-out форма создания клиента.
 *
 * Поведение:
 *   - Esc → close (с confirm если форма dirty)
 *   - Cmd/Ctrl+Enter → submit
 *   - Click overlay → close (с confirm)
 *   - Click outside dialog (само slide-out) — игнорируется
 *
 * @param {object} props
 * @param {number} props.callerId — id текущего пользователя (dashboard_users.id)
 * @param {function} props.onClose — callback при закрытии (без сохранения)
 * @param {function} props.onCreated — callback (newClientId) после успешного создания
 */
export function CreateClientSlideOut({ callerId, onClose, onCreated }) {
  const navigate = useNavigate()
  const { createClient } = useClientActions(callerId)
  const { rows: platforms, loading: platformsLoading } = usePlatforms()
  const [form, setForm] = useState(EMPTY_FORM)
  const [avatarFile, setAvatarFile] = useState(null) // File | null
  const [avatarError, setAvatarError] = useState(null)
  const { rows: agencies } = useAgencies({ platformId: form.platformId || null })

  const [errors, setErrors] = useState({})       // { fieldKey: message }
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const nameInputRef = useRef(null)

  const isDirty = useMemo(() => {
    return (
      form.name.trim() !== '' ||
      form.alias.trim() !== '' ||
      form.description.trim() !== '' ||
      form.platformId !== '' ||
      form.agencyId !== '' ||
      form.tableauId.trim() !== '' ||
      avatarFile !== null
    )
  }, [form, avatarFile])

  // Initial focus
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Auto-pick first platform if there's only one
  useEffect(() => {
    if (!form.platformId && platforms.length === 1) {
      setForm((f) => ({ ...f, platformId: platforms[0].id }))
    }
  }, [platforms, form.platformId])

  // If selected platform changes and current agency doesn't belong — reset agency
  useEffect(() => {
    if (form.agencyId && !agencies.some((a) => a.id === form.agencyId)) {
      setForm((f) => ({ ...f, agencyId: '' }))
    }
  }, [form.agencyId, agencies])

  // Hotkeys: Esc, Cmd/Ctrl+Enter
  useEffect(() => {
    const onKey = (e) => {
      if (showCloseConfirm) return
      if (e.key === 'Escape') {
        e.preventDefault()
        attemptClose()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCloseConfirm, isDirty, submitting, form, avatarFile])

  function attemptClose() {
    if (submitting) return
    if (isDirty) setShowCloseConfirm(true)
    else onClose()
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validateAll() {
    const next = {}
    const nameRes = validateName(form.name)
    if (!nameRes.valid) next.name = nameRes.error
    if (!form.platformId) next.platformId = 'Выберите платформу'
    if (!form.agencyId) next.agencyId = 'Выберите агентство'
    const aliasRes = validateAlias(form.alias)
    if (!aliasRes.valid) next.alias = aliasRes.error
    const tblRes = validateTableauId(form.tableauId)
    if (!tblRes.valid) next.tableauId = tblRes.error
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleAvatarSelect(file) {
    setAvatarError(null)
    if (!file) {
      setAvatarFile(null)
      return
    }
    const v = validateFile(file, 'avatar')
    if (!v.valid) {
      setAvatarError(v.error)
      return
    }
    setAvatarFile(file)
  }

  async function uploadAvatar(file) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('client-avatars')
      .upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) throw new Error(`Не удалось загрузить аватар: ${uploadError.message}`)
    const { data } = supabase.storage.from('client-avatars').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitError(null)
    if (!validateAll()) return

    setSubmitting(true)
    try {
      let avatarUrl = null
      if (avatarFile) {
        avatarUrl = await uploadAvatar(avatarFile)
      }
      const newId = await createClient({
        name: form.name.trim(),
        alias: form.alias.trim() || null,
        description: form.description.trim() || null,
        avatarUrl,
        platformId: form.platformId,
        agencyId: form.agencyId,
        tableauId: form.tableauId.trim() || null,
      })
      onCreated?.(newId)
      navigate(`/clients/${newId}`)
    } catch (err) {
      setSubmitError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={attemptClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-client-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-card shadow-2xl border-l border-border"
      >
        <header className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 id="create-client-title" className="text-lg font-bold text-foreground">
              Новый клиент
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Поля со звёздочкой обязательны
            </p>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            disabled={submitting}
            aria-label="Закрыть форму создания клиента"
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-auto px-6 py-5">
            <AvatarDropZone
              file={avatarFile}
              error={avatarError}
              onSelect={handleAvatarSelect}
              onRemove={() => {
                setAvatarFile(null)
                setAvatarError(null)
              }}
              disabled={submitting}
            />

            <div className="mt-6 space-y-5">
              <Field
                label="Имя"
                required
                error={errors.name}
                hint="Публичное имя на платформе"
              >
                <input
                  ref={nameInputRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  disabled={submitting}
                  placeholder="например, Sofia Reign"
                  className={inputCls(!!errors.name)}
                />
              </Field>

              <Field
                label="Alias"
                error={errors.alias}
                hint="Опционально. Используется для поиска"
              >
                <input
                  type="text"
                  value={form.alias}
                  onChange={(e) => setField('alias', e.target.value)}
                  disabled={submitting}
                  placeholder="@sofia.reign"
                  className={inputCls(!!errors.alias)}
                />
              </Field>

              <Field
                label="Платформа"
                required
                error={errors.platformId}
              >
                <select
                  value={form.platformId}
                  onChange={(e) => setField('platformId', e.target.value)}
                  disabled={submitting || platformsLoading}
                  className={selectCls(!!errors.platformId)}
                >
                  <option value="">Выберите платформу…</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Агентство"
                required
                error={errors.agencyId}
              >
                <select
                  value={form.agencyId}
                  onChange={(e) => setField('agencyId', e.target.value)}
                  disabled={submitting || !form.platformId}
                  className={selectCls(!!errors.agencyId)}
                >
                  <option value="">
                    {form.platformId ? 'Выберите агентство…' : 'Сначала выберите платформу'}
                  </option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Описание"
                hint="Plain text. Перенос строки сохраняется"
              >
                <textarea
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  disabled={submitting}
                  rows={4}
                  placeholder="Контент, аудитория, особенности тона…"
                  className={`${inputCls(false)} resize-y`}
                />
              </Field>

              <section className="rounded-lg bg-muted/60 p-4">
                <h3 className="mb-3 flex items-center gap-1.5 label-caps">
                  <LinkIcon size={12} />
                  Опционально · Интеграции
                </h3>
                <Field
                  label="Tableau ID"
                  error={errors.tableauId}
                  hint="Связка с дашбордом аналитики"
                >
                  <input
                    type="text"
                    value={form.tableauId}
                    onChange={(e) => setField('tableauId', e.target.value)}
                    disabled={submitting}
                    placeholder="например, TBL-2351"
                    className={`${inputCls(!!errors.tableauId)} font-mono`}
                  />
                </Field>
              </section>
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t border-border bg-muted/40 px-6 py-4">
            {submitError && (
              <p
                className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                role="alert"
              >
                {submitError}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--fg4)]">
                <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono text-[10px]">
                  Esc
                </kbd>{' '}
                закрыть ·{' '}
                <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono text-[10px]">
                  ⌘↵
                </kbd>{' '}
                создать
              </span>
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                onClick={attemptClose}
                disabled={submitting}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Создаётся…
                  </>
                ) : (
                  <><Check size={14} className="inline mr-1.5" />Создать клиента</>
                )}
              </Button>
            </div>
          </footer>
        </form>
      </aside>

      {showCloseConfirm && (
        <CreateClientCloseConfirm
          onContinue={() => setShowCloseConfirm(false)}
          onDiscard={() => {
            setShowCloseConfirm(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

// ============================================================================
// Field shell + form atomics
// ============================================================================

function Field({ label, required, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block label-caps">
        {label}
        {required && <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-[var(--danger-ink)]" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-[var(--fg4)]">{hint}</span>
      ) : null}
    </label>
  )
}

function inputCls(hasError) {
  return [
    'w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors text-foreground',
    'placeholder:text-[var(--fg4)]',
    hasError
      ? 'border-[var(--danger)] focus:border-[var(--danger)] focus:ring-2 focus:ring-[var(--danger)]/25'
      : 'border-border hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]',
    'disabled:bg-muted disabled:opacity-60',
  ].join(' ')
}

function selectCls(hasError) {
  return inputCls(hasError) + ' cursor-pointer'
}

// ============================================================================
// Avatar drop-zone
// ============================================================================

function AvatarDropZone({ file, error, onSelect, onRemove, disabled }) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const previewUrl = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const f = e.dataTransfer.files?.[0]
    if (f) onSelect(f)
  }

  if (file) {
    return (
      <div
        className={[
          'flex items-center gap-4 rounded-xl border bg-card p-3',
          error ? 'border-[var(--danger)]' : 'border-border',
        ].join(' ')}
      >
        <img
          src={previewUrl}
          alt=""
          className="h-16 w-16 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground tabular">
            {formatFileSize(file.size)}
          </p>
          {error && (
            <p className="mt-0.5 text-xs text-[var(--danger-ink)]" role="alert">{error}</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-[var(--primary-soft)] disabled:opacity-50"
          >
            Заменить
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded-md px-2 py-1 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={FILE_LIMITS.avatar.mimeTypes.join(',')}
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0])}
        />
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        'flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors',
        dragOver
          ? 'border-primary bg-[var(--primary-soft)]/40'
          : error
            ? 'border-[var(--danger)]'
            : 'border-border-strong hover:border-[var(--fg4)]',
        disabled && 'cursor-not-allowed opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-[var(--fg4)]">
        <ImageIcon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Аватар</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          PNG / JPG · до 5 МБ · не попадает в фото-галерею
        </p>
        <p className="text-xs text-[var(--fg4)]">
          Нажмите или перетащите файл
        </p>
        {error && (
          <p className="mt-1 text-xs text-[var(--danger-ink)]" role="alert">{error}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) inputRef.current?.click()
        }}
        disabled={disabled}
      >
        <Upload size={14} /> Загрузить
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_LIMITS.avatar.mimeTypes.join(',')}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0])}
      />
    </div>
  )
}

