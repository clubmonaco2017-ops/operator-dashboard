import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyZero({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="mb-4 text-sm text-muted-foreground">Агентств пока нет</p>
      <Button size="sm" onClick={onCreate}>+ Создать первое</Button>
    </div>
  )
}
