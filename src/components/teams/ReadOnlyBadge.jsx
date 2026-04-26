import { Eye } from 'lucide-react'

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
      <Eye size={10} />
      Только просмотр
    </span>
  )
}
