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
import { supabase } from '../../supabaseClient.js'

export function ArchiveAgencyDialog({ agency, onClose, onArchived }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('archive_agency', {
      p_agency_id: agency.id,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    onArchived()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Архивировать агентство?</DialogTitle>
          <DialogDescription>
            «{agency.name}» будет скрыто из активного списка. У агентства не должно быть
            активных пользователей, клиентов или команд — иначе RPC вернёт ошибку.
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
            {submitting ? 'Архивируем…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
