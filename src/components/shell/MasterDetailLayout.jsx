export function MasterDetailLayout({ listPane, listLabel, detailLabel, children }) {
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside aria-label={listLabel} className="border-r border-border bg-card overflow-y-auto">
        {listPane}
      </aside>
      <section aria-label={detailLabel} className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
