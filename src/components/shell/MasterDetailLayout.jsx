import { useIsMobile } from '@/hooks/use-mobile'

export function MasterDetailLayout({
  listPane,
  listLabel,
  detailLabel,
  detailEmpty = true,
  children,
}) {
  const isMobile = useIsMobile()
  if (isMobile) {
    if (detailEmpty) {
      return (
        <aside aria-label={listLabel} className="h-full overflow-y-auto">
          {listPane}
        </aside>
      )
    }
    return (
      <section aria-label={detailLabel} className="h-full overflow-y-auto">
        {children}
      </section>
    )
  }
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside
        aria-label={listLabel}
        className="border-r border-border bg-card overflow-y-auto"
      >
        {listPane}
      </aside>
      <section aria-label={detailLabel} className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
