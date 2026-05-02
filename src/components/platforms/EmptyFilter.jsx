import { Button } from '@/components/ui/button'

export function EmptyFilter({ onClearSearch }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="mb-3 text-sm text-muted-foreground">Ничего не найдено</p>
      <Button variant="outline" size="sm" onClick={onClearSearch}>
        Очистить поиск
      </Button>
    </div>
  )
}
