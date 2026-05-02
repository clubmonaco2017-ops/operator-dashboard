import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { platformApi } from '../../lib/platforms.js'

export function DeletePlatformDialog({ platform, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await platformApi('delete', { id: platform.id })
    setSubmitting(false)
    if (err) {
      setError(err.message ?? String(err))
      return
    }
    onDeleted()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить платформу?</DialogTitle>
          <DialogDescription>
            «{platform.name}» будет удалена безвозвратно. Если у платформы есть привязанные
            агентства — операция отклонится FK constraint'ом.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive break-words" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отменить
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
