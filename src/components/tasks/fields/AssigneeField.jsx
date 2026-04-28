import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTaskActions } from '../../../hooks/useTaskActions.js'
import { AssigneeSelector } from '../AssigneeSelector.jsx'
import { RoleBadge } from '../../staff/RoleBadge.jsx'
import { Button } from '@/components/ui/button'

/**
 * Inline-editable исполнитель для TaskDetailPanel / TaskMetaSidebar.
 * Behavior 1:1 c исходным AssigneeField из TaskFieldsCard.jsx.
 *
 * canReassign = editable && task.status === 'pending' (I-8).
 */
export function AssigneeField({ callerId, task, editable, canReassign, onChanged }) {
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
            className="rounded-md p-0.5 text-[var(--fg4)] hover:bg-muted hover:text-foreground"
            aria-label="Изменить исполнителя"
          >
            <Pencil size={14} />
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
            <Button
              type="button"
              onClick={save}
              disabled={saving || !draft || draft === task.assigned_to}
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
          </div>
        </div>
      ) : (
        <div>
          <p className="flex items-baseline gap-2 text-sm text-foreground">
            <span className="font-medium">{task.assigned_to_name ?? '—'}</span>
            <RoleBadge role={task.assigned_to_role} />
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
