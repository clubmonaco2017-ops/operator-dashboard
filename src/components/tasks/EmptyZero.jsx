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
          <ClipboardIcon />
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

function ClipboardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M6 6h12v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
