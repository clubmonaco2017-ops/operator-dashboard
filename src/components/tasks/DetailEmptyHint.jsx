/**
 * Хинт в detail-панели когда master содержит данные, но задача не выбрана.
 */
export function TaskDetailEmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-[var(--fg4)]">
        <CursorIcon />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Выберите задачу слева
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Описание, отчёт и история задачи откроются в этой панели.
      </p>
    </div>
  )
}

function CursorIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M5 5l5 14 2.5-5.5L18 11 5 5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
