import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTaskActions } from '../../../hooks/useTaskActions.js'
import { formatDeadlineRelative } from '../../../lib/tasks.js'
import { Button } from '@/components/ui/button'

/**
 * Inline-editable дедлайн-поле для TaskDetailPanel / TaskMetaSidebar.
 * Behavior 1:1 c исходным DeadlineField из TaskFieldsCard.jsx.
 */
export function DeadlineField({ callerId, task, editable, onChanged }) {
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
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
            aria-label="Редактировать дедлайн"
          >
            <Pencil size={14} />
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
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              {saving ? 'Сохраняем…' : 'Сохранить'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={saving}
              className="text-xs px-3 py-1.5"
            >
              Отмена
            </Button>
            {draft && (
              <button
                type="button"
                onClick={() => setDraft('')}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground rounded"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      ) : task.deadline ? (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-foreground">
          <span>{formatAbsoluteDeadline(task.deadline)}</span>
          <DeadlineRelativeBadge deadline={task.deadline} />
        </p>
      ) : (
        <p className="text-sm italic text-[var(--fg4)]">Без дедлайна</p>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components (private)
// ============================================================================

const URGENCY_BADGE_CLASS = {
  overdue: 'bg-[var(--danger-soft)] text-[var(--danger-ink)]',
  today: 'bg-[var(--warning-soft)] text-[var(--warning-ink)]',
  soon: 'bg-[var(--warning-soft)] text-[var(--warning-ink)]',
  later: 'bg-muted text-muted-foreground',
}

function DeadlineRelativeBadge({ deadline }) {
  const label = formatDeadlineRelative(deadline)
  if (!label) return null
  const urgency = deadlineUrgency(deadline)
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        URGENCY_BADGE_CLASS[urgency],
      ].join(' ')}
    >
      {label}
    </span>
  )
}

/**
 * Классификация дедлайна по «срочности» — отражает ветки formatDeadlineRelative:
 * overdue (просрочено) → today (сегодня) → soon (завтра) → later (через N дней).
 */
function deadlineUrgency(deadline, now = new Date()) {
  if (!deadline) return 'later'
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return 'later'
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'soon'
  return 'later'
}

// ============================================================================
// Helpers (private)
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
