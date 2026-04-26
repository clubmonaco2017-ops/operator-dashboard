import { FilterX } from 'lucide-react'

/**
 * Empty state когда клиенты есть, но под фильтр не подходят.
 * Detail-панель при этом схлопнута (см. R2.0a.6).
 *
 * @param {object} props
 * @param {Array<{label: string, onClear: function}>} props.activeFilters — список применённых фильтров с handler сброса
 * @param {function} props.onResetAll — сбросить все фильтры
 * @param {string} [props.searchQuery] — если поиск активен, упомянуть в копирайте
 * @param {function} [props.onClearSearch]
 */
export function EmptyFilter({ activeFilters = [], onResetAll, searchQuery, onClearSearch }) {
  const hasSearch = !!searchQuery
  const hasFilters = activeFilters.length > 0

  let bodyText
  if (hasSearch && hasFilters) {
    bodyText = `По запросу «${searchQuery}» с активными фильтрами ничего не найдено.`
  } else if (hasSearch) {
    bodyText = `По запросу «${searchQuery}» ничего не найдено.`
  } else if (activeFilters.length === 1) {
    bodyText = `Снимите фильтр «${activeFilters[0].label}» или сбросьте все фильтры.`
  } else {
    bodyText = `Снимите один из ${activeFilters.length} фильтров или сбросьте все.`
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-sm rounded-xl border border-dashed border-border-strong px-6 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FilterX size={22} />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          {hasSearch && !hasFilters ? 'Ничего не найдено' : 'Под фильтр ничего не подходит'}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{bodyText}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {hasSearch && (
            <button type="button" onClick={onClearSearch} className="btn-primary">
              Очистить поиск
            </button>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={onResetAll}
              className={hasSearch ? 'btn-ghost' : 'btn-primary'}
            >
              <FilterX size={14} /> Сбросить фильтры
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
