/**
 * Маленький pill «Только просмотр» для команды/раздела, недоступного на запись.
 */
export function ReadOnlyBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      role="status"
      title="У вас нет прав на изменение этой команды"
    >
      <EyeIcon />
      Только просмотр
    </span>
  )
}

function EyeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M1 6c1.5-2.5 3.2-3.5 5-3.5S9.5 3.5 11 6c-1.5 2.5-3.2 3.5-5 3.5S2.5 8.5 1 6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
    </svg>
  )
}
