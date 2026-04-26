import { useEffect, useRef, useState } from 'react'
import { useTaskActions } from '../../hooks/useTaskActions.js'
import { canEditTask } from '../../lib/tasks.js'

/**
 * Карточка «Описание» в TaskDetailPanel.
 * Inline-edit с textarea (паттерн из ProfileTab.DescriptionCard).
 */
export function TaskDescriptionCard({ callerId, user, task, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const editable = canEditTask(user, task)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setDraft(task.description ?? '')
  }, [task.description])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  async function save() {
    const next = draft.trim()
    const cur = (task.description ?? '').trim()
    if (next === cur) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(task.id, { description: next || null })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(task.description ?? '')
    setEditing(false)
    setError(null)
  }

  return (
    <section className="surface-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label-caps">Описание</h3>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-1 text-[var(--fg4)] hover:bg-muted hover:text-foreground focus-ds"
            aria-label="Редактировать описание"
          >
            <PencilIcon />
          </button>
        )}
      </header>

      {editing ? (
        <div>
          <textarea
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            rows={4}
            placeholder="Что нужно сделать, контекст, ссылки…"
            className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-[var(--fg4)] focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
          />
          {error && (
            <p className="mt-1 text-xs text-[var(--danger-ink)]" role="alert">
              {error}
            </p>
          )}
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
              onClick={cancel}
              disabled={saving}
              className="btn-ghost text-xs px-3 py-1.5"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : task.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--fg2)]">
          {task.description}
        </p>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">Без описания</p>
      )}
    </section>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M2 12l1-3 7-7 2 2-7 7-3 1zM9 3l2 2"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
