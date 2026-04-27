import { FilterX } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Empty state когда задачи есть, но не подходят под фильтр / поиск.
 *
 * @param {object} props
 * @param {boolean} props.hasSearch
 * @param {boolean} props.hasFilter
 * @param {() => void} [props.onClearSearch]
 * @param {() => void} [props.onClearFilters]
 */
export function TaskEmptyFilter({
  hasSearch,
  hasFilter,
  onClearSearch,
  onClearFilters,
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
          {hasSearch && hasFilter
            ? 'Уточните поиск или сбросьте фильтры.'
            : hasSearch
              ? 'По вашему запросу задач не найдено.'
              : 'Сбросьте фильтры, чтобы увидеть остальные задачи.'}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasSearch && (
            <Button onClick={onClearSearch}>
              Очистить поиск
            </Button>
          )}
          {hasFilter && (
            <Button variant={hasSearch ? 'ghost' : 'default'} onClick={onClearFilters}>
              Сбросить фильтры
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

