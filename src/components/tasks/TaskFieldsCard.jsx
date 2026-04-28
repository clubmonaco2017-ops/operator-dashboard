import { canEditTask } from '../../lib/tasks.js'
import { DeadlineField } from './fields/DeadlineField.jsx'
import { AssigneeField } from './fields/AssigneeField.jsx'

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
      <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
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
