import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { pluralizeOperators } from '../../lib/teams.js'
import { pluralizeClients } from '../../lib/clients.js'

/**
 * Confirm-диалог для архивирования команды. Restore — без confirm.
 *
 * @param {object} props
 * @param {string} props.teamName
 * @param {number} props.members
 * @param {number} props.clients
 * @param {boolean} props.busy
 * @param {function} props.onCancel
 * @param {function} props.onConfirm
 */
export function ArchiveTeamConfirmDialog({
  teamName,
  members = 0,
  clients = 0,
  busy,
  onCancel,
  onConfirm,
}) {
  const releaseLine =
    members > 0 || clients > 0
      ? `${pluralizeOperators(members)} и ${pluralizeClients(clients)} будут освобождены.`
      : 'Команда сейчас пустая — освобождать никого не нужно.'

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Архивировать команду?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{teamName}</span> · {releaseLine}{' '}
            Команду можно восстановить позже.
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
