import { useEffect, useRef, useState } from 'react'
import { useTaskActions } from '../../hooks/useTaskActions.js'
import { canEditTask, formatDeadlineRelative } from '../../lib/tasks.js'
import { AssigneeSelector } from './AssigneeSelector.jsx'

const ROLE_LABEL = {
  admin: 'Админ',
  superadmin: 'Суперадмин',
  teamlead: 'Тимлид',
  moderator: 'Модератор',
  operator: 'Оператор',
}

/**
 * Карточка «Поля» в TaskDetailPanel.
 * Два поля: Дедлайн (datetime-local) и Исполнитель (AssigneeSelector).
 *
 * Исполнителя можно менять только пока задача в статусе pending (I-8).
 */
export function TaskFieldsCard({ callerId, user, task, onChanged }) {
  const editable = canEditTask(user, task)
  const canReassign = editable && task.status === 'pending'

  return (
    <section className="surface-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="label-caps">Поля</h3>
      </header>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <DeadlineField
          callerId={callerId}
          task={task}
          editable={editable}
          onChanged={onChanged}
        />
        <AssigneeField
          callerId={callerId}
          task={task}
          editable={editable}
          canReassign={canReassign}
          onChanged={onChanged}
        />
      </div>
    </section>
  )
}

// ============================================================================
// Deadline
// ============================================================================

function DeadlineField({ callerId, task, editable, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(toLocalInputValue(task.deadline))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    setDraft(toLocalInputValue(task.deadline))
  }, [task.deadline])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  async function save() {
    const next = draft ? new Date(draft).toISOString() : null
    const cur = task.deadline ? new Date(task.deadline).toISOString() : null
    if (next === cur) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (next === null) {
        await updateTask(task.id, { clearDeadline: true })
      } else {
        await updateTask(task.id, { deadline: next })
      }
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(toLocalInputValue(task.deadline))
    setEditing(false)
    setError(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="block label-caps">Дедлайн</span>
        {editable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground focus-ds"
            aria-label="Редактировать дедлайн"
          >
            <PencilIcon />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <input
            ref={ref}
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-[var(--primary-ring)]"
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
            {draft && (
              <button
                type="button"
                onClick={() => setDraft('')}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground focus-ds rounded"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      ) : task.deadline ? (
        <p className="text-sm text-foreground">
          {formatAbsoluteDeadline(task.deadline)}{' '}
          <span className="text-xs text-muted-foreground">
            · {formatDeadlineRelative(task.deadline)}
          </span>
        </p>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">Без дедлайна</p>
      )}
    </div>
  )
}

// ============================================================================
// Assignee
// ============================================================================

function AssigneeField({ callerId, task, editable, canReassign, onChanged }) {
  const { updateTask } = useTaskActions(callerId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.assigned_to ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setDraft(task.assigned_to ?? null)
  }, [task.assigned_to])

  async function save() {
    if (!draft || draft === task.assigned_to) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTask(task.id, { assignedTo: draft })
      setEditing(false)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(task.assigned_to ?? null)
    setEditing(false)
    setError(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="block label-caps">Исполнитель</span>
        {canReassign && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground focus-ds"
            aria-label="Изменить исполнителя"
          >
            <PencilIcon />
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <AssigneeSelector
            callerId={callerId}
            value={draft}
            onChange={setDraft}
            error={error}
            disabled={saving}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft || draft === task.assigned_to}
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
      ) : (
        <div>
          <p className="text-sm text-foreground">
            <span className="font-medium">{task.assigned_to_name ?? '—'}</span>
            {task.assigned_to_role && (
              <span className="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {ROLE_LABEL[task.assigned_to_role] || task.assigned_to_role}
              </span>
            )}
          </p>
          {editable && !canReassign && (
            <p className="mt-1 text-xs italic text-[var(--fg4)]">
              Можно изменить только для задач в ожидании
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * ISO → datetime-local input value (YYYY-MM-DDTHH:MM в локальной TZ).
 */
function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatAbsoluteDeadline(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
