/**
 * Empty state когда команд нет вообще.
 * Размещается в master-панели.
 */
export function TeamEmptyZero({ onCreate, canCreate }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
          <UsersPlusIcon />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Команд пока нет
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Создайте первую команду, чтобы начать распределять операторов и клиентов.
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary mt-5"
          >
            + Создать первую команду
          </button>
        )}
      </div>
    </div>
  )
}

function UsersPlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 19.5c.5-3.5 3-5 6.5-5s6 1.5 6.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M18 8v6M15 11h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
