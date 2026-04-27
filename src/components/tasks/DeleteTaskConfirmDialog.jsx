import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { pluralRu } from '../../lib/clients.js'

/**
 * Confirm-диалог удаления задачи (admin/superadmin).
 *
 * @param {object} props
 * @param {string} props.taskTitle
 * @param {number} props.mediaCount — кол-во файлов отчёта (для текста подтверждения)
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function DeleteTaskConfirmDialog({
  taskTitle,
  mediaCount = 0,
  busy,
  onCancel,
  onConfirm,
}) {
  const fileWord = pluralRu(mediaCount, {
    one: 'файл',
    few: 'файла',
    many: 'файлов',
  })

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить задачу «{taskTitle}» безвозвратно?</DialogTitle>
          <DialogDescription>
            {mediaCount > 0
              ? `${mediaCount} ${fileWord} отчёта будут удалены. Действие необратимо.`
              : 'Действие необратимо.'}
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
            {busy ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
