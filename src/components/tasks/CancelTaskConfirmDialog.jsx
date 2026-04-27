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
 * Confirm-диалог отмены задачи.
 *
 * @param {object} props
 * @param {string} props.taskTitle
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function CancelTaskConfirmDialog({ taskTitle, busy, onCancel, onConfirm }) {
  const truncated =
    taskTitle && taskTitle.length > 60 ? `${taskTitle.slice(0, 60)}…` : taskTitle

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Отменить задачу «{truncated}»?</DialogTitle>
          <DialogDescription>
            Задача перейдёт в статус «Отменена». Это можно увидеть в истории, но восстановить нельзя.
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
            {busy ? 'Отменяем…' : 'Отменить задачу'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
