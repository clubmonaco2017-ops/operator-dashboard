import { UserPlus } from 'lucide-react'

/**
 * Empty state когда клиентов нет вообще.
 * Размещается в master-панели; detail при этом схлопнут (см. R2.0.4).
 */
export function EmptyZero({ onCreate, canCreate }) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]">
          <UserPlus size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Клиентов пока нет
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Здесь появятся клиенты агентства. Каждый клиент закреплён за платформой и агентством.
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="btn-primary mt-5"
          >
            + Добавить первого клиента
          </button>
        )}
      </div>
    </div>
  )
}
