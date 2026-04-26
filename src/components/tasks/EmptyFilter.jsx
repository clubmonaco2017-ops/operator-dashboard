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
          <FunnelXIcon />
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
            <button type="button" onClick={onClearSearch} className="btn-primary">
              Очистить поиск
            </button>
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={onClearFilters}
              className={hasSearch ? 'btn-ghost' : 'btn-primary'}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FunnelXIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 5h12l-4.5 7v6l-3-1.5v-4.5L3 5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 14l5 5m-5 0l5-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
