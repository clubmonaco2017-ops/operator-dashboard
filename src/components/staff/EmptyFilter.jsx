import { FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Empty state когда сотрудники есть, но под поиск/role-фильтр не подходят.
 *
 * @param {object} props
 * @param {boolean} props.hasSearch
 * @param {boolean} props.hasRoleFilter — фильтр роли отличается от 'all'
 * @param {function} [props.onClearSearch]
 * @param {function} [props.onClearRole]
 */
export function StaffEmptyFilter({
  hasSearch,
  hasRoleFilter,
  onClearSearch,
  onClearRole,
}) {
  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FilterX size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Под фильтр ничего не подходит
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {hasSearch && hasRoleFilter
            ? 'Уточните поиск или сбросьте фильтр роли.'
            : hasSearch
              ? 'По вашему запросу сотрудников не найдено.'
              : 'Сбросьте фильтр роли, чтобы увидеть остальных сотрудников.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasSearch && (
            <Button onClick={onClearSearch}>Очистить поиск</Button>
          )}
          {hasRoleFilter && (
            <Button variant={hasSearch ? 'ghost' : 'default'} onClick={onClearRole}>
              Сбросить роль
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
