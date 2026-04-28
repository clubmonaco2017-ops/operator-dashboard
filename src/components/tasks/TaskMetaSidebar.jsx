import { canEditTask } from '../../lib/tasks.js'
import { StatusPill } from './StatusPill.jsx'
import { DeadlineField } from './fields/DeadlineField.jsx'
import { AssigneeField } from './fields/AssigneeField.jsx'

function ReadonlySection({ label, children }) {
  return (
    <div>
      <span className="block label-caps mb-1">{label}</span>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

/**
 * Sidebar с meta-полями задачи: Статус, Постановщик, Исполнитель, Дедлайн.
 *
 * variant='sidebar' — для xl+ двухколоночной вёрстки. Без surface-card обёртки,
 *   секции в `flex-col gap-5`, опциональная левая граница.
 * variant='card'    — для < xl single-column режима. Обёрнут в surface-card
 *   с заголовком «Поля», секции в 2-column grid (md+).
 */
export function TaskMetaSidebar({ callerId, user, task, status, onChanged, variant = 'sidebar' }) {
  const editable = canEditTask(user, task)
  const canReassign = editable && task.status === 'pending'

  const statusSection = (
    <ReadonlySection label="Статус">
      <StatusPill status={status} />
    </ReadonlySection>
  )
  const creatorSection = (
    <ReadonlySection label="Постановщик">
      <span className="font-medium">{task.created_by_name ?? '—'}</span>
    </ReadonlySection>
  )
  const assigneeSection = (
    <AssigneeField
      callerId={callerId}
      task={task}
      editable={editable}
      canReassign={canReassign}
      onChanged={onChanged}
    />
  )
  const deadlineSection = (
    <DeadlineField
      callerId={callerId}
      task={task}
      editable={editable}
      onChanged={onChanged}
    />
  )

  if (variant === 'card') {
    return (
      <section className="surface-card p-5">
        <header className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h3 className="label-caps">Поля</h3>
        </header>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          {statusSection}
          {creatorSection}
          {assigneeSection}
          {deadlineSection}
        </div>
      </section>
    )
  }

  // variant === 'sidebar'
  return (
    <aside
      className="flex flex-col gap-5"
      aria-label="Свойства задачи"
    >
      {statusSection}
      {creatorSection}
      {assigneeSection}
      {deadlineSection}
    </aside>
  )
}
