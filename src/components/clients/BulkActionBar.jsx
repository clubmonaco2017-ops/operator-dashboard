/**
 * Action bar для bulk-select режима. Используется в Photo и Video галереях.
 *
 * @param {object} props
 * @param {number} props.selectedCount
 * @param {number} props.totalCount
 * @param {boolean} props.allSelected
 * @param {boolean} props.busy
 * @param {function} props.onSelectAll
 * @param {function} props.onClearAll
 * @param {function} props.onDownload
 * @param {function} props.onDelete
 */
export function BulkActionBar({
  selectedCount,
  totalCount,
  allSelected,
  busy,
  onSelectAll,
  onClearAll,
  onDownload,
  onDelete,
}) {
  const hasSelection = selectedCount > 0
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--primary-soft)] bg-[var(--primary-soft)]/40 px-4 py-2.5"
      role="region"
      aria-label="Действия с выбранными элементами"
    >
      <span
        className="inline-flex items-center gap-2 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground tabular"
        aria-live="polite"
      >
        {selectedCount} выбрано
      </span>
      {!allSelected && (
        <button
          type="button"
          onClick={onSelectAll}
          disabled={busy}
          className="text-sm font-medium text-[var(--primary-ink)] hover:underline disabled:opacity-50 focus-ds rounded"
        >
          Выбрать все {totalCount}
        </button>
      )}
      {hasSelection && (
        <button
          type="button"
          onClick={onClearAll}
          disabled={busy}
          className="text-sm font-medium text-muted-foreground hover:underline disabled:opacity-50 focus-ds rounded"
        >
          Снять {allSelected ? 'все' : 'выделение'}
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onDownload}
        disabled={busy || !hasSelection}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-[var(--fg2)] hover:bg-muted disabled:opacity-50 focus-ds"
      >
        <DownloadIcon /> Скачать {hasSelection ? selectedCount : ''}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy || !hasSelection}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--danger-soft)] bg-card px-3 py-1.5 text-xs font-semibold text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-50 focus-ds"
      >
        <TrashIcon /> Удалить {hasSelection ? selectedCount : ''}
      </button>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
      <path
        d="M6.5 2v6.5M4 6l2.5 2.5L9 6M2.5 11h8"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
      <path
        d="M2.5 4h8M5 4V2.5h3V4M3.5 4l.5 7h5l.5-7M5.5 6v3M7.5 6v3"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
