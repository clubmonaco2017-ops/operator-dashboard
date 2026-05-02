import { Button } from '@/components/ui/button'

export function EmptyFilter({ hasSearch, status, onClearSearch, onResetStatus }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="mb-3 text-sm text-muted-foreground">Ничего не найдено</p>
      <div className="flex gap-2">
        {hasSearch && (
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Очистить поиск
          </Button>
        )}
        {status !== 'active' && (
          <Button variant="outline" size="sm" onClick={onResetStatus}>
            Показать активные
          </Button>
        )}
      </div>
    </div>
  )
}
