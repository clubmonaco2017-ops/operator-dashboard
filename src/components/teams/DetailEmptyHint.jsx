import { MousePointer2 } from 'lucide-react'

/**
 * Хинт в detail-панели когда master содержит данные, но команда не выбрана.
 */
export function TeamDetailEmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-[var(--fg4)]">
        <MousePointer2 size={22} />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Выберите команду слева
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Состав, клиенты и настройки команды откроются в этой панели.
      </p>
    </div>
  )
}
