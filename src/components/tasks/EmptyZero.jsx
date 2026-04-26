import { ClipboardList } from 'lucide-react'

/**
 * Empty state когда задач нет (под текущий box).
 *
 * @param {object} props
 * @param {'inbox'|'outbox'|'all'} props.box
 * @param {boolean} props.canCreate
 * @param {() => void} props.onCreate
 */
export function TaskEmptyZero({ box, canCreate, onCreate }) {
  const copy = COPY[box] ?? COPY.inbox
  const showCta = canCreate && box !== 'inbox'

  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
          <ClipboardList size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {copy.title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{copy.body}</p>
        {showCta && (
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary mt-5"
          >
            + Новая задача
          </button>
        )}
      </div>
    </div>
  )
}

const COPY = {
  inbox: {
    title: 'Нет задач для вас',
    body: 'Здесь появятся задачи, назначенные вам коллегами или администрацией.',
  },
  outbox: {
    title: 'Вы не создавали задач',
    body: 'Создайте задачу, чтобы поручить её коллеге или оператору.',
  },
  all: {
    title: 'Задач пока нет',
    body: 'В системе ещё нет ни одной задачи. Создайте первую, чтобы начать.',
  },
}

