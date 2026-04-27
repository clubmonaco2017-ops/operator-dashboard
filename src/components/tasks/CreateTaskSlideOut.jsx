import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { useTaskActions } from '../../hooks/useTaskActions.js'
import { validateTaskTitle } from '../../lib/tasks.js'
import { AssigneeSelector } from './AssigneeSelector.jsx'
import { Button } from '../ui/button.jsx'

/**
 * Slide-out форма создания задачи.
 * Поля: title (req), description (опц), deadline (опц), assignedTo (req).
 *
 * Hotkeys: Esc → close (с confirm если форма «грязная»), Cmd/Ctrl+Enter → submit.
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {() => void} props.onClose
 * @param {(newTaskId:number) => void} props.onCreated
 */
export function CreateTaskSlideOut({ callerId, onClose, onCreated }) {
  const { createTask } = useTaskActions(callerId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [assignedTo, setAssignedTo] = useState(null)

  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  const titleInputRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    titleInputRef.current?.focus()
    return () => {
      try {
        previouslyFocused.current?.focus?.()
      } catch {
        /* unmounted */
      }
    }
  }, [])

  const isDirty =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    deadline !== '' ||
    assignedTo != null

  function attemptClose() {
    if (submitting) return
    if (isDirty) {
      setConfirmCloseOpen(true)
    } else {
      onClose()
    }
  }

  // Hotkeys
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (confirmCloseOpen) {
          setConfirmCloseOpen(false)
        } else {
          attemptClose()
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, confirmCloseOpen, title, description, deadline, assignedTo])

  function setTitleField(value) {
    setTitle(value)
    if (errors.title) setErrors((e) => ({ ...e, title: undefined }))
  }

  function setAssigneeField(value) {
    setAssignedTo(value)
    if (errors.assignedTo) setErrors((e) => ({ ...e, assignedTo: undefined }))
  }

  function validateAll() {
    const next = {}
    const titleRes = validateTaskTitle(title)
    if (!titleRes.valid) next.title = titleRes.error
    if (assignedTo == null) next.assignedTo = 'Выберите исполнителя'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitError(null)
    if (!validateAll()) return

    setSubmitting(true)
    try {
      const newId = await createTask({
        title: title.trim(),
        description: description.trim() || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        assignedTo,
      })
      onCreated?.(newId)
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
        aria-labelledby="create-task-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-card shadow-2xl border-l border-border"
      >
        <header className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 id="create-task-title" className="text-lg font-bold text-foreground">
              Новая задача
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Поля со звёздочкой обязательны
            </p>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            disabled={submitting}
            aria-label="Закрыть форму создания задачи"
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
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            <Field
              label="Название задачи"
              required
              error={errors.title}
              hint="Кратко: что нужно сделать"
            >
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitleField(e.target.value)}
                disabled={submitting}
                placeholder="Например, «Прислать отчёт за неделю»"
                maxLength={200}
                className={inputCls(!!errors.title)}
              />
            </Field>

            <Field
              label="Описание"
              error={null}
              hint="Подробности, контекст, ожидаемый результат"
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                rows={4}
                placeholder="Опционально"
                className={`${inputCls(false)} resize-y min-h-[88px]`}
              />
            </Field>

            <Field
              label="Дедлайн"
              error={null}
              hint="Опционально. Без дедлайна задача не может быть просрочена."
            >
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                disabled={submitting}
                className={inputCls(false)}
              />
            </Field>

            <Field
              label="Исполнитель"
              required
              error={errors.assignedTo}
            >
              <AssigneeSelector
                callerId={callerId}
                value={assignedTo}
                onChange={setAssigneeField}
                error={errors.assignedTo}
                disabled={submitting}
              />
            </Field>
          </div>

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
                  <><Check size={14} className="inline mr-1.5" />Создать задачу</>
                )}
              </Button>
            </div>
          </footer>
        </form>
      </aside>

      {confirmCloseOpen && (
        <ConfirmCloseDialog
          onCancel={() => setConfirmCloseOpen(false)}
          onConfirm={() => {
            setConfirmCloseOpen(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Inline confirm dialog for dirty close
// ---------------------------------------------------------------------------

function ConfirmCloseDialog({ onCancel, onConfirm }) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-close-task-title"
        className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-6 shadow-2xl border border-border"
      >
        <h3
          id="confirm-close-task-title"
          className="text-base font-semibold text-foreground"
        >
          Отменить создание задачи?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Введённые данные будут потеряны.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Продолжить редактирование
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            autoFocus
          >
            Отменить
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Field / styling helpers (mirrored from CreateTeamSlideOut)
// ---------------------------------------------------------------------------

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

