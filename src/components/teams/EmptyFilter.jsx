import { FilterX } from 'lucide-react'

/**
 * Empty state когда команды есть, но под поиск/фильтр не подходят.
 *
 * @param {object} props
 * @param {boolean} props.hasSearch
 * @param {boolean} props.hasActiveFilter — фильтр активности отличается от 'active'
 * @param {function} [props.onClearSearch]
 * @param {function} [props.onClearActive]
 */
export function TeamEmptyFilter({
  hasSearch,
  hasActiveFilter,
  onClearSearch,
  onClearActive,
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
          {hasSearch && hasActiveFilter
            ? 'Уточните поиск или сбросьте фильтр активности.'
            : hasSearch
              ? 'По вашему запросу команд не найдено.'
              : 'Сбросьте фильтр активности, чтобы увидеть остальные команды.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasSearch && (
            <button type="button" onClick={onClearSearch} className="btn-primary">
              Очистить поиск
            </button>
          )}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onClearActive}
              className={hasSearch ? 'btn-ghost' : 'btn-primary'}
            >
              Сбросить активность
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

