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
 * Confirm-диалог при попытке закрыть форму с несохранённым вводом.
 *
 * @param {object} props
 * @param {function} props.onContinue — вернуться к редактированию
 * @param {function} props.onDiscard — закрыть без сохранения
 */
export function CreateClientCloseConfirm({ onContinue, onDiscard }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onContinue()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Закрыть без сохранения?</DialogTitle>
          <DialogDescription>Введённые данные будут потеряны.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onDiscard}
            className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          >
            Закрыть без сохранения
          </Button>
          <Button type="button" onClick={onContinue} autoFocus>
            Продолжить ввод
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
