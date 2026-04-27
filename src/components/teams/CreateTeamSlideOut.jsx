import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useTeamActions } from '../../hooks/useTeamActions.js'
import { validateTeamName, formatLeadRole } from '../../lib/teams.js'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

/**
 * Slide-out форма создания команды. Минимальная — два поля:
 *   - Название команды (required)
 *   - Лид (admin/superadmin/teamlead/moderator, активные)
 *
 * Поведение:
 *   - Esc → close (без confirm — форма короткая, риск потери минимален)
 *   - Cmd/Ctrl+Enter → submit
 *   - Click overlay → close
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {function} props.onClose
 * @param {function} props.onCreated — (newTeamId) => void
 */
export function CreateTeamSlideOut({ callerId, onClose, onCreated }) {
  const { createTeam } = useTeamActions(callerId)

  const [name, setName] = useState('')
  const [leadUserId, setLeadUserId] = useState('')
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(true)

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const nameInputRef = useRef(null)

  const formRef = useRef({ name: '', leadUserId: '' })
  formRef.current = { name, leadUserId }

  // Initial focus
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // Load lead candidates: admin/superadmin/teamlead/moderator (включаем admin/superadmin —
  // они тоже могут вести команду, по DB-схеме (см. update_team / create_team).
  useEffect(() => {
    let cancelled = false
    setLeadsLoading(true)
    supabase
      .from('dashboard_users')
      .select('id, first_name, last_name, alias, email, role')
      .in('role', ['superadmin', 'admin', 'teamlead', 'moderator'])
      .eq('is_active', true)
      .order('first_name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (!err) setLeads(data ?? [])
      })
      .then(() => {
        if (!cancelled) setLeadsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Hotkeys — Cmd/Ctrl+Enter submit (Esc handled by Sheet primitive)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting])

  function setNameField(value) {
    setName(value)
    if (errors.name) setErrors((e) => ({ ...e, name: undefined }))
  }

  function setLeadField(value) {
    setLeadUserId(value)
    if (errors.leadUserId) setErrors((e) => ({ ...e, leadUserId: undefined }))
  }

  function validateAll() {
    const next = {}
    const nameRes = validateTeamName(name)
    if (!nameRes.valid) next.name = nameRes.error
    if (!leadUserId) next.leadUserId = 'Выберите лида команды'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitError(null)
    if (!validateAll()) return

    setSubmitting(true)
    try {
      const newId = await createTeam({
        name: name.trim(),
        leadUserId: Number(leadUserId),
      })
      onCreated?.(newId)
    } catch (err) {
      setSubmitError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && !submitting && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-[440px]"
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-lg font-bold text-foreground">
            Новая команда
          </SheetTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Поля со звёздочкой обязательны
          </p>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            <Field
              label="Название команды"
              required
              error={errors.name}
              hint="Например, «Команда Альфа»"
            >
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setNameField(e.target.value)}
                disabled={submitting}
                placeholder="Команда Альфа"
                maxLength={120}
                className={inputCls(!!errors.name)}
              />
            </Field>

            <Field
              label="Лид команды"
              required
              error={errors.leadUserId}
              hint={leadsLoading ? 'Загружаем кандидатов…' : 'Тимлид, модератор или админ'}
            >
              <select
                value={leadUserId}
                onChange={(e) => setLeadField(e.target.value)}
                disabled={submitting || leadsLoading}
                className={selectCls(!!errors.leadUserId)}
              >
                <option value="">
                  {leadsLoading ? 'Загрузка…' : 'Выберите лида…'}
                </option>
                {leads.map((u) => (
                  <option key={u.id} value={u.id}>
                    {leadLabel(u)} — {formatLeadRole(u.role) || u.role}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <SheetFooter className="mt-0 flex-col gap-0 border-t border-border bg-muted/40 px-6 py-4">
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
                onClick={() => !submitting && onClose()}
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
                  <><Check size={14} className="inline mr-1.5" />Создать команду</>
                )}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function leadLabel(u) {
  const fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
  if (fullName) return fullName
  if (u.alias) return u.alias
  return u.email ?? `#${u.id}`
}

function Field({ label, required, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block label-caps">
        {label}
        {required && (
          <span className="ml-0.5 text-[var(--danger)]" aria-label="обязательное поле">*</span>
        )}
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

