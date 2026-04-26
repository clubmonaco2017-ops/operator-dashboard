export function MasterDetailLayout({ listPane, children }) {
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside className="border-r border-border bg-card overflow-y-auto">
        {listPane}
      </aside>
      <section className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
