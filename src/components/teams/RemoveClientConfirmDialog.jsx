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
 * Confirm-диалог: снять клиента с команды.
 *
 * @param {object} props
 * @param {string|null} props.name
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function RemoveClientConfirmDialog({ name, busy, onCancel, onConfirm }) {
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Снять {name ?? 'клиента'} с команды?</DialogTitle>
          <DialogDescription>
            Клиент станет нераспределённым и его можно будет назначить другой команде.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant="ghost"
            onClick={onConfirm}
            disabled={busy}
            className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          >
            {busy ? 'Снимаем…' : 'Снять'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
