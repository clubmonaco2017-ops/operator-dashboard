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
 * Confirm-диалог: убрать оператора из команды.
 *
 * @param {object} props
 * @param {string|null} props.name
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function RemoveMemberConfirmDialog({ name, busy, onCancel, onConfirm }) {
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Убрать {name ?? 'оператора'} из команды?</DialogTitle>
          <DialogDescription>
            Оператор останется активным, но потеряет доступ к клиентам команды.
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
            {busy ? 'Убираем…' : 'Убрать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
