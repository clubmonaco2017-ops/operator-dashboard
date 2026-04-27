import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Confirm-диалог для архивирования клиента.
 * Restore (из архива) — без confirm, мгновенно (см. R1).
 *
 * @param {object} props
 * @param {string} props.clientName
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 * @param {boolean} props.busy
 */
export function ArchiveConfirmDialog({ clientName, onCancel, onConfirm, busy }) {
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Архивировать клиента?</DialogTitle>
          <DialogDescription>
            {clientName} перестанет показываться в списке активных. Это можно отменить — снова сделать клиента активным в любой момент.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onConfirm}
            disabled={busy}
            className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          >
            {busy ? 'Архивируем…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
