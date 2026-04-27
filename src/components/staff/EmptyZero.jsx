import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Empty state когда сотрудников нет вообще (только superadmin при пустой БД).
 */
export function StaffEmptyZero({ onCreate, canCreate }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
          <UserPlus size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Сотрудников пока нет
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Добавьте первого сотрудника, чтобы начать работу.
        </p>
        {canCreate && (
          <Button onClick={onCreate} className="mt-5">
            + Добавить первого
          </Button>
        )}
      </div>
    </div>
  )
}
