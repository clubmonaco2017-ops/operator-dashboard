import { MousePointerClick } from 'lucide-react'

/**
 * Empty state в правой панели, когда сотрудник не выбран.
 */
export function StaffDetailEmptyHint() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MousePointerClick size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Выберите сотрудника слева
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Профиль, атрибуты, права и активность откроются в этой панели.
        </p>
      </div>
    </div>
  )
}
