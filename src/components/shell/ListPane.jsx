export function ListPane({ title, search, filters, createButton, children }) {
  return (
    <div className="flex flex-col h-full">
      {(title || createButton) && (
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-semibold flex-1 min-w-0 truncate">{title}</h2>
          )}
          {createButton}
        </div>
      )}
      {search && <div className="p-3 border-b border-border">{search}</div>}
      {filters && <div className="p-3 border-b border-border">{filters}</div>}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
