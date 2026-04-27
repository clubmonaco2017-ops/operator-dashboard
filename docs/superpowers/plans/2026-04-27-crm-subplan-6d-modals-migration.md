# Subplan 6D — Hand-rolled overlays → shadcn `<Dialog>` / `<Sheet>` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 20 hand-rolled overlay components (7 confirms, 9 modals, 4 slide-outs) with the shadcn `<Dialog>` / `<Sheet>` primitives and retire the local `ModalShell` helper.

**Architecture:** Three sequential waves (confirms → modals → slide-outs), 9 buckets total, paired implementation+review subagent invocations per bucket. Parents keep conditional mount; migrated components hard-code `open={true}` and route close via `onOpenChange(false) → onClose`. Dirty-state slide-out close-confirms are nested `<Dialog>` over `<Sheet>` (Base UI portal stacking handles z-index/focus). One PR per Wave (3 PRs).

**Tech Stack:** React 19, Vite, Tailwind v4, `@base-ui/react/dialog` primitive (already installed at `src/components/ui/dialog.jsx` and `src/components/ui/sheet.jsx`), vitest + `@testing-library/react`, ESLint v9.

**Spec:** [docs/superpowers/specs/2026-04-27-crm-subplan-6d-modals-migration-design.md](../specs/2026-04-27-crm-subplan-6d-modals-migration-design.md)

---

## File structure

**New files (created in B3):**
- `src/components/teams/RemoveMemberConfirmDialog.jsx` — extracted from `TeamMembersTab.jsx:171-202`
- `src/components/teams/RemoveClientConfirmDialog.jsx` — extracted from `TeamClientsTab.jsx:139-170`

**Modified — confirms (Wave 1, 7 files):**
- `src/components/clients/CreateClientCloseConfirm.jsx`
- `src/components/clients/ArchiveConfirmDialog.jsx`
- `src/components/tasks/DeleteTaskConfirmDialog.jsx`
- `src/components/tasks/CancelTaskConfirmDialog.jsx`
- `src/components/teams/ArchiveTeamConfirmDialog.jsx`
- `src/components/teams/TeamMembersTab.jsx` (remove inline `RemoveMemberConfirm`, import new file)
- `src/components/teams/TeamClientsTab.jsx` (remove inline `RemoveClientConfirm`, import new file)

**Modified — modals (Wave 2, 9 files):**
- `src/components/staff/ChangeTeamModal.jsx`
- `src/components/staff/ChangeCuratorModal.jsx`
- `src/components/staff/AddCuratedOperatorsModal.jsx`
- `src/components/staff/ApprovalReviewModal.jsx`
- `src/components/staff/DeleteRequestModal.jsx`
- `src/components/staff/ChangePasswordModal.jsx` (also delete `ModalShell` export)
- `src/components/teams/AddClientsModal.jsx`
- `src/components/teams/ChangeLeadModal.jsx`
- `src/components/teams/AddMemberModal.jsx`

**Modified — slide-outs (Wave 3, 4 files):**
- `src/components/clients/CreateClientSlideOut.jsx`
- `src/components/tasks/CreateTaskSlideOut.jsx`
- `src/components/teams/CreateTeamSlideOut.jsx`
- `src/components/staff/CreateStaffSlideOut.jsx`

**Tests touched:**
- `src/components/staff/DeleteRequestModal.test.jsx` — uses `screen.getByRole`/`getByLabelText` (already portal-safe; expected to pass without changes after Wave 2 B5)

---

## Recipe references

The spec contains the full per-type recipes:
- **Confirm dialog recipe:** spec §4.1
- **Simple modal recipe:** spec §4.2 (first code block)
- **List-picker modal recipe:** spec §4.2 (second code block — for `<DialogContent className="flex max-h-[Xvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">`)
- **Slide-out recipe with dirty-confirm flow:** spec §4.3
- **Destructive button variants:** spec §6 table (authoritative — match verbatim per file)

Each implementation step references the relevant section. Do not invent variants.

---

## Setup

### Task 0: Verify baseline

**Files:** none (read-only).

- [ ] **Step 0.1: Verify clean working tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean` (or only the design spec/plan committed). If anything else is staged or modified, stop and ask the user.

- [ ] **Step 0.2: Verify lint passes on baseline**

```bash
npm run lint
```
Expected: exit 0, no errors. If it already fails, stop — fixing pre-existing lint is not 6D's job.

- [ ] **Step 0.3: Verify test suite passes on baseline**

```bash
npm run test:run
```
Expected: all tests pass. If anything fails, capture the failure list and proceed cautiously — only failures introduced by 6D need to be addressed.

- [ ] **Step 0.4: Inventory hand-rolled overlays**

```bash
grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)" | sort
```
Expected: exactly 20 files (the in-scope inventory). If this count differs, reconcile with the spec §2 file list before starting.

---

## Wave 1 — Confirm dialogs

Per spec §4.1. Each confirm dialog migration:
1. Replace `<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal aria-labelledby="...">` outer wrapper with `<Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>`.
2. Replace inner `<div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">` with `<DialogContent className="sm:max-w-md">`.
3. Replace `<h3 id="..." className="text-base font-semibold text-foreground">` with `<DialogTitle>`.
4. Replace `<p className="mt-2 text-sm text-muted-foreground">` with `<DialogDescription>`.
5. Replace `<div className="mt-5 flex justify-end gap-2">` with `<DialogFooter>`.
6. Remove `useEffect` containing window-level Esc listener and `cancelBtnRef.current?.focus()` block (Base UI handles both). If the file also tracked `previouslyFocused` for focus restore, that's also removable (Base UI restores focus on unmount).
7. Remove `useRef` for `cancelBtnRef` / `previouslyFocused` (no longer used).
8. Drop `useEffect, useRef` from imports if unused after edits.
9. Preserve all destructive button variants verbatim per spec §6 — do not change `variant="ghost"` + danger tokens to `variant="destructive"`.

### Task W1.B1: Migrate `clients/CreateClientCloseConfirm` + `clients/ArchiveConfirmDialog`

**Files:**
- Modify: `src/components/clients/CreateClientCloseConfirm.jsx` (entire file)
- Modify: `src/components/clients/ArchiveConfirmDialog.jsx` (entire file)

**Per-file specifics:**

| File | `<DialogContent>` width | Destructive button | Safe button |
|---|---|---|---|
| `CreateClientCloseConfirm` | `sm:max-w-md` | "Закрыть без сохранения" → `variant="ghost"` + danger tokens | "Продолжить ввод" → default |
| `ArchiveConfirmDialog` | `sm:max-w-md` | "Архивировать" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` |

**Special note for `CreateClientCloseConfirm`:** the safe action ("Продолжить ввод") currently has `ref={continueBtnRef}` for initial focus. Remove the ref + the `useEffect` (Base UI auto-focuses the first focusable; for this dialog the order is "Закрыть без сохранения" then "Продолжить ввод" — destructive first which would auto-focus to destructive). To preserve safe-default focus, add `autoFocus` to the "Продолжить ввод" button instead of keeping the ref+useEffect.

- [ ] **Step W1.B1.1: Read current source for both files** — note the destructive variant exactly as it appears.

```bash
cat src/components/clients/CreateClientCloseConfirm.jsx
cat src/components/clients/ArchiveConfirmDialog.jsx
```

- [ ] **Step W1.B1.2: Migrate `CreateClientCloseConfirm.jsx`**

Replace the entire file with:

```jsx
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
```

- [ ] **Step W1.B1.3: Migrate `ArchiveConfirmDialog.jsx`**

Replace the entire file with:

```jsx
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
```

- [ ] **Step W1.B1.4: Verify removal of legacy patterns**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby|useEffect|useRef' src/components/clients/CreateClientCloseConfirm.jsx src/components/clients/ArchiveConfirmDialog.jsx
```
Expected: no matches (empty output).

- [ ] **Step W1.B1.5: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W1.B1.6: Commit**

```bash
git add src/components/clients/CreateClientCloseConfirm.jsx src/components/clients/ArchiveConfirmDialog.jsx
git commit -m "feat(modals): 6D B1 — Clients confirm dialogs migrate to <Dialog>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W1.B2: Migrate `tasks/DeleteTaskConfirmDialog` + `tasks/CancelTaskConfirmDialog` + `teams/ArchiveTeamConfirmDialog`

**Files:**
- Modify: `src/components/tasks/DeleteTaskConfirmDialog.jsx`
- Modify: `src/components/tasks/CancelTaskConfirmDialog.jsx`
- Modify: `src/components/teams/ArchiveTeamConfirmDialog.jsx`

**Per-file specifics:**

| File | `<DialogContent>` width | Destructive button | Safe button | Notes |
|---|---|---|---|---|
| `DeleteTaskConfirmDialog` | `sm:max-w-md` | "Удалить" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` | preserves `mediaCount`/`fileWord` body computation |
| `CancelTaskConfirmDialog` | `sm:max-w-md` | "Отменить задачу" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` | preserves `truncated` title computation |
| `ArchiveTeamConfirmDialog` | `sm:max-w-md` | "Архивировать" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` | preserves `releaseLine` body computation |

- [ ] **Step W1.B2.1: Read current sources**

```bash
cat src/components/tasks/DeleteTaskConfirmDialog.jsx
cat src/components/tasks/CancelTaskConfirmDialog.jsx
cat src/components/teams/ArchiveTeamConfirmDialog.jsx
```

- [ ] **Step W1.B2.2: Migrate `DeleteTaskConfirmDialog.jsx`**

Replace the entire file with:

```jsx
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
```

- [ ] **Step W1.B2.3: Migrate `CancelTaskConfirmDialog.jsx`**

Replace the entire file with:

```jsx
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
```

- [ ] **Step W1.B2.4: Migrate `ArchiveTeamConfirmDialog.jsx`**

Replace the entire file with:

```jsx
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
```

- [ ] **Step W1.B2.5: Verify removal of legacy patterns**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby|useEffect|useRef' src/components/tasks/DeleteTaskConfirmDialog.jsx src/components/tasks/CancelTaskConfirmDialog.jsx src/components/teams/ArchiveTeamConfirmDialog.jsx
```
Expected: empty output.

- [ ] **Step W1.B2.6: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W1.B2.7: Commit**

```bash
git add src/components/tasks/DeleteTaskConfirmDialog.jsx src/components/tasks/CancelTaskConfirmDialog.jsx src/components/teams/ArchiveTeamConfirmDialog.jsx
git commit -m "feat(modals): 6D B2 — Tasks/Teams confirm dialogs migrate to <Dialog>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W1.B3: Extract `RemoveMemberConfirmDialog` + `RemoveClientConfirmDialog` and update parent tabs

**Files:**
- Create: `src/components/teams/RemoveMemberConfirmDialog.jsx`
- Create: `src/components/teams/RemoveClientConfirmDialog.jsx`
- Modify: `src/components/teams/TeamMembersTab.jsx` (remove inline `RemoveMemberConfirm` helper at lines 167-202; import + render the new file with the same prop name `RemoveMemberConfirmDialog`)
- Modify: `src/components/teams/TeamClientsTab.jsx` (remove inline `RemoveClientConfirm` helper at lines 137-170; import + render the new file)

**Per-file specifics:**

| File | `<DialogContent>` width | Destructive button | Safe button |
|---|---|---|---|
| `RemoveMemberConfirmDialog` | `sm:max-w-sm` (preserves existing `max-w-sm` from inline) | "Убрать" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` |
| `RemoveClientConfirmDialog` | `sm:max-w-sm` | "Снять" → `variant="ghost"` + danger tokens | "Отмена" → `variant="ghost"` |

- [ ] **Step W1.B3.1: Read parent tabs to understand consumer JSX shape**

```bash
sed -n '155,165p' src/components/teams/TeamMembersTab.jsx
sed -n '125,135p' src/components/teams/TeamClientsTab.jsx
```
Note exact callback prop names (`name`, `busy`, `onCancel`, `onConfirm`) — preserved verbatim.

- [ ] **Step W1.B3.2: Create `RemoveMemberConfirmDialog.jsx`**

Create file with content:

```jsx
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
```

- [ ] **Step W1.B3.3: Create `RemoveClientConfirmDialog.jsx`**

Create file with content:

```jsx
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
```

- [ ] **Step W1.B3.4: Update `TeamMembersTab.jsx`**

In `src/components/teams/TeamMembersTab.jsx`:

1. Add import near the top of the file (alongside other component imports):
   ```jsx
   import { RemoveMemberConfirmDialog } from './RemoveMemberConfirmDialog.jsx'
   ```
2. Find the JSX block that currently renders `<RemoveMemberConfirm ...>` (around line 156). Replace the component name `RemoveMemberConfirm` with `RemoveMemberConfirmDialog`. Keep all props unchanged.
3. Delete the entire local helper function `function RemoveMemberConfirm({ name, busy, onCancel, onConfirm }) { ... }` (the block at lines 167-202 plus its preceding `// ---` comment band at lines 167-170).

- [ ] **Step W1.B3.5: Update `TeamClientsTab.jsx`**

In `src/components/teams/TeamClientsTab.jsx`:

1. Add import:
   ```jsx
   import { RemoveClientConfirmDialog } from './RemoveClientConfirmDialog.jsx'
   ```
2. Find the JSX block rendering `<RemoveClientConfirm ...>` (around line 126). Replace component name `RemoveClientConfirm` with `RemoveClientConfirmDialog`. Keep all props unchanged.
3. Delete the local helper `function RemoveClientConfirm({ name, busy, onCancel, onConfirm }) { ... }` block (lines 137-170, plus its preceding `// ---` comment band).

- [ ] **Step W1.B3.6: Verify removals and stale imports**

```bash
grep -n "RemoveMemberConfirm\b\|RemoveClientConfirm\b" src/components/teams/TeamMembersTab.jsx src/components/teams/TeamClientsTab.jsx
```
Expected: zero hits to the bare names `RemoveMemberConfirm` or `RemoveClientConfirm` (only `RemoveMemberConfirmDialog` and `RemoveClientConfirmDialog` should appear). The `\b` ensures partial-match safety.

```bash
grep -nE 'fixed inset-0' src/components/teams/TeamMembersTab.jsx src/components/teams/TeamClientsTab.jsx
```
Expected: empty (the only `fixed inset-0` in both tabs was inside the deleted helpers).

- [ ] **Step W1.B3.7: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W1.B3.8: Run tests**

```bash
npm run test:run
```
Expected: all pass. (No tests directly cover the inline confirm; this is a behavioral-equivalence extract.)

- [ ] **Step W1.B3.9: Commit**

```bash
git add src/components/teams/RemoveMemberConfirmDialog.jsx src/components/teams/RemoveClientConfirmDialog.jsx src/components/teams/TeamMembersTab.jsx src/components/teams/TeamClientsTab.jsx
git commit -m "feat(modals): 6D B3 — extract Teams inline confirms to sibling files

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W1.PR: Open Wave 1 PR

- [ ] **Step W1.PR.1: Push branch and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(modals): Subplan 6D Wave 1 — confirm dialogs migration" --body "$(cat <<'EOF'
## Summary
- Migrate 7 confirm dialogs from hand-rolled `<div className="fixed inset-0...">` to shadcn `<Dialog>` (Subplan 6D, Wave 1 of 3).
- Extract two inline confirms from `TeamMembersTab.jsx` and `TeamClientsTab.jsx` into sibling files (`RemoveMemberConfirmDialog`, `RemoveClientConfirmDialog`).
- All destructive button variants preserved verbatim per [spec §6](docs/superpowers/specs/2026-04-27-crm-subplan-6d-modals-migration-design.md).

## Test plan
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] Preview: archive a client in Clients list — Esc closes, backdrop click closes, both buttons fire
- [ ] Preview: cancel a task — same checks
- [ ] Preview: archive a team — same checks
- [ ] Preview: open Team Members tab, click "Убрать" on a member — confirm dialog appears, Esc/backdrop work
- [ ] Preview: open Team Clients tab, click "Снять" on a client — same checks
- [ ] Preview: in Create Client slide-out (still legacy at this Wave), enter text and Esc — `CreateClientCloseConfirm` (now `<Dialog>`) opens above the legacy slide-out, Esc cancels confirm and returns to slide-out

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step W1.PR.2: Wait for PR to be merged**

After review and approval, merge per memory `project_gh_auth.md`:

```bash
gh auth switch --user clubmonaco2017-ops
gh pr merge --squash --delete-branch
gh auth switch --user temashdesign
```

---

## Wave 2 — Modals

Per spec §4.2. Two recipe variants:

**Simple form modal** (used for `ChangePasswordModal`, `DeleteRequestModal`, `ApprovalReviewModal`): `<DialogContent className="sm:max-w-md">` with `<DialogHeader>` / form body / `<DialogFooter>` directly. Default `<DialogContent>` padding (`p-4`) is correct.

**List-picker modal** (used for `ChangeTeamModal`, `ChangeCuratorModal`, `AddCuratedOperatorsModal`, `AddClientsModal`, `ChangeLeadModal`, `AddMemberModal`): `<DialogContent className="flex max-h-[Xvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">` with bordered regions inside. The `p-0 gap-0` overrides the default `p-4 gap-4` so each region (header / error banner / scrollable list / footer) controls its own padding. The custom `<header>` close button is removed — `<DialogContent>`'s default `showCloseButton` renders the X.

For all modals, replace the inline error banner pattern (`<div role="alert" className="...bg-[var(--danger-soft)]...">`) verbatim — it stays inside the new flex layout.

### Task W2.B4: Migrate Staff `ChangeTeamModal` + `ChangeCuratorModal`

**Files:**
- Modify: `src/components/staff/ChangeTeamModal.jsx`
- Modify: `src/components/staff/ChangeCuratorModal.jsx`

**Per-file specifics:**

| File | `<DialogContent>` className | Submit button | Notes |
|---|---|---|---|
| `ChangeTeamModal` | `flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | "Сохранить" → default | preserves `<ul role="radiogroup">` body, `ListSkeleton`, `closeBtnRef` removable |
| `ChangeCuratorModal` | `flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | "Сохранить" → default | preserves `Avatar` helper, radiogroup body |

**Recipe — apply to both files:**

1. Add imports for `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` (NOT `DialogDescription` — these are list pickers).
2. Wrap entire return JSX with `<Dialog open onOpenChange={(next) => !next && !submitting && onClose()}><DialogContent ...>...</DialogContent></Dialog>`.
3. Delete the outer `<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal aria-labelledby="..." onClick={...}>` and its inner `<div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl max-h-[90vh]">` — both replaced by `<DialogContent>`.
4. Replace `<header className="flex items-center justify-between border-b border-border px-5 py-4"><h3 id="..." ...>{title}</h3><button ...><X /></button></header>` with `<DialogHeader className="border-b border-border px-5 py-4"><DialogTitle>{title}</DialogTitle></DialogHeader>` — the `<button><X></button>` close is replaced by `<DialogContent>`'s built-in close button.
5. Keep error banner `{error && <div role="alert" className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]">{error}</div>}` verbatim.
6. Keep middle `<div className="flex-1 overflow-auto">{...list body...}</div>` verbatim.
7. Replace `<footer className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3">{...buttons...}</footer>` with `<DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">{...buttons...}</DialogFooter>`.
8. Delete the entire `useEffect(() => { previouslyFocused.current = document.activeElement; closeBtnRef.current?.focus(); const onKey = ...; ... }, [onClose, submitting])` block.
9. Delete `closeBtnRef` and `previouslyFocused` `useRef` declarations.
10. Drop `useEffect` and `X` (lucide) and `useRef` from imports if unused after edits. Keep `useState`.

- [ ] **Step W2.B4.1: Read current sources**

```bash
cat src/components/staff/ChangeTeamModal.jsx
cat src/components/staff/ChangeCuratorModal.jsx
```

- [ ] **Step W2.B4.2: Migrate `ChangeTeamModal.jsx`** — apply recipe steps 1-10 above.

After edit, the relevant return shape should look like:

```jsx
return (
  <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
    <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
      <DialogHeader className="border-b border-border px-5 py-4">
        <DialogTitle>
          {currentTeamId == null ? 'Назначить в команду' : 'Перевести в другую команду'}
        </DialogTitle>
      </DialogHeader>

      {error && (
        <div className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]" role="alert">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <ListSkeleton />
        ) : teams.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm italic text-[var(--fg4)]">
            Нет других активных команд.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="radiogroup" aria-label="Команды">
            {/* ...preserved list body verbatim... */}
          </ul>
        )}
      </div>

      <DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">
        <Button variant="ghost" size="sm" onClick={() => !submitting && onClose()} disabled={submitting}>
          Отмена
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={submitting || selected == null}>
          {submitting ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
```

The `useEffect` for Esc/focus must be deleted; `closeBtnRef` and `previouslyFocused` removed; `X`/`useEffect`/`useRef` import lines pruned.

- [ ] **Step W2.B4.3: Migrate `ChangeCuratorModal.jsx`** — same recipe applied to its own JSX shape (title text "Назначить куратора" / "Сменить куратора", body uses `<Avatar>` helper, footer same Cancel/Save buttons).

- [ ] **Step W2.B4.4: Verify removal of legacy patterns**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby|closeBtnRef|previouslyFocused' src/components/staff/ChangeTeamModal.jsx src/components/staff/ChangeCuratorModal.jsx
```
Expected: empty.

```bash
grep -n 'import.*X.*lucide-react\|import.*useRef\|import.*useEffect' src/components/staff/ChangeTeamModal.jsx src/components/staff/ChangeCuratorModal.jsx
```
Expected: only `useEffect` import (still needed for the `supabase.rpc` data-load `useEffect`); `X` and `useRef` should be gone.

- [ ] **Step W2.B4.5: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W2.B4.6: Commit**

```bash
git add src/components/staff/ChangeTeamModal.jsx src/components/staff/ChangeCuratorModal.jsx
git commit -m "feat(modals): 6D B4 — Staff Change{Team,Curator}Modal migrate to <Dialog>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W2.B5: Migrate Staff `AddCuratedOperatorsModal` + `ApprovalReviewModal` + `DeleteRequestModal`

**Files:**
- Modify: `src/components/staff/AddCuratedOperatorsModal.jsx`
- Modify: `src/components/staff/ApprovalReviewModal.jsx`
- Modify: `src/components/staff/DeleteRequestModal.jsx`

**Per-file specifics:**

| File | Recipe | `<DialogContent>` className | Submit button | Notes |
|---|---|---|---|---|
| `AddCuratedOperatorsModal` | list-picker | `flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | "Назначить (N)" → default | has search bar + footer with selected count; both regions preserved |
| `ApprovalReviewModal` | simple form | `sm:max-w-md` | "Одобрить" → `variant="destructive"` | replace `<ModalShell>` wrapper with `<Dialog>+<DialogContent>+<DialogHeader><DialogTitle>` |
| `DeleteRequestModal` | simple form | `sm:max-w-md` | "Отправить" → `variant="destructive"` | replace `<ModalShell>` wrapper |

**For `ApprovalReviewModal` and `DeleteRequestModal` (ModalShell consumers):**

Replace:
```jsx
import { ModalShell } from './ChangePasswordModal.jsx'
// ...
return (
  <ModalShell title="..." onClose={onClose}>
    {/* body */}
  </ModalShell>
)
```

With:
```jsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
// ...
return (
  <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>...</DialogTitle>
      </DialogHeader>
      {/* body */}
    </DialogContent>
  </Dialog>
)
```

Note: `ApprovalReviewModal` uses `submitting` for the disable-state guard; `DeleteRequestModal` uses `submitting` similarly. Both should guard `onOpenChange` accordingly.

**Note about ModalShell export:** This task does NOT delete the `ModalShell` export from `ChangePasswordModal.jsx`. That happens in B6. After B5, `ChangePasswordModal` itself still uses `ModalShell` internally — the export remains.

- [ ] **Step W2.B5.1: Read sources**

```bash
cat src/components/staff/AddCuratedOperatorsModal.jsx
cat src/components/staff/ApprovalReviewModal.jsx
cat src/components/staff/DeleteRequestModal.jsx
```

- [ ] **Step W2.B5.2: Migrate `AddCuratedOperatorsModal.jsx`** — apply list-picker recipe (W2.B4 steps 1-10 generalized). Preserve:
  - search bar in middle of file (`<div className="border-b border-border px-5 py-3"><label className="relative block">...search input...</label></div>`)
  - `useDebounce` helper, `Avatar` helper, `ListSkeleton` helper, `opLabel` helper — all kept
  - footer has `<span>Выбрано: N</span>` on left + buttons on right; that whole row goes inside `<DialogFooter className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-5 py-3">`. Note: `<DialogFooter>` default has `flex-col-reverse sm:flex-row sm:justify-end` — override with explicit className for `justify-between`.
  - `searchRef.current?.focus()` initial-focus is preserved via `autoFocus` on the search `<input>` (replace useEffect+ref with `autoFocus`).
  - Delete `previouslyFocused` ref.

- [ ] **Step W2.B5.3: Migrate `ApprovalReviewModal.jsx`**

Replace the entire file with:

```jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ApprovalReviewModal({ request, onClose, onDone }) {
  const { user } = useAuth()
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function call(rpc) {
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc(rpc, {
      p_caller_id: user.id,
      p_request_id: request.id,
      p_comment: comment.trim() || null,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    onDone?.()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Запрос на удаление: {request.target_full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <dl className="space-y-1 rounded-md bg-muted p-3 text-xs">
            <div><dt className="inline text-muted-foreground">Кто запросил:</dt> <dd className="inline font-medium">{request.requested_by_full_name} ({request.requested_by_ref_code})</dd></div>
            <div><dt className="inline text-muted-foreground">Когда:</dt> <dd className="inline">{new Date(request.created_at).toLocaleString('ru-RU')}</dd></div>
            <div><dt className="inline text-muted-foreground">Кого:</dt> <dd className="inline font-medium">{request.target_full_name} — {request.target_email} ({request.target_ref_code})</dd></div>
          </dl>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Причина:</div>
            <div className="rounded-md border-l-2 border-border bg-muted p-3 text-foreground">
              {request.reason}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий (опционально)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          {error && <p role="alert" className="text-sm text-[var(--danger-ink)]">{error}</p>}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => call('reject_deletion')} disabled={submitting} className="flex-1">
              Отклонить
            </Button>
            <Button variant="destructive" onClick={() => call('approve_deletion')} disabled={submitting} className="flex-1">
              Одобрить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Verify the existing source's variable names and prop shape (`request.target_full_name`, `request.requested_by_full_name`, etc.) match this draft. If any field name differs in the actual source, adjust the migrated file to preserve the existing names verbatim — do not "improve" them.

- [ ] **Step W2.B5.4: Migrate `DeleteRequestModal.jsx`**

Replace the entire file with (preserving exact prop names and the 20-char `canSubmit` rule from the existing source):

```jsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function DeleteRequestModal({ targetUserId, targetName, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const canSubmit = reason.trim().length >= 20 && !submitting

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Запросить удаление: {targetName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            После одобрения суперадмином пользователь будет помечен как удалённый.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Причина (минимум 20 символов)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
            />
            <span className="mt-1 text-xs text-muted-foreground">{reason.trim().length} / 20</span>
          </label>
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => canSubmit && (setSubmitting(true), onSubmit(reason.trim()))}
              disabled={!canSubmit}
              className="flex-1"
            >
              Отправить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

⚠ Verify against the actual existing source: the current implementation may invoke `onSubmit` differently (e.g., not setting `submitting` itself, leaving it to the parent). Match the existing call signature exactly. If the original is `onClick={() => canSubmit && onSubmit(reason.trim())}`, use that — do not introduce `setSubmitting(true)`.

- [ ] **Step W2.B5.5: Verify removals**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby|closeBtnRef|previouslyFocused|ModalShell' src/components/staff/AddCuratedOperatorsModal.jsx src/components/staff/ApprovalReviewModal.jsx src/components/staff/DeleteRequestModal.jsx
```
Expected: empty (note: `ModalShell` import gone from Approval/DeleteRequest; the export still exists in `ChangePasswordModal.jsx` and is removed in B6).

- [ ] **Step W2.B5.6: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W2.B5.7: Run targeted tests**

```bash
npm run test:run -- src/components/staff/DeleteRequestModal.test.jsx
```
Expected: all 2 tests pass. The tests use `screen.getByRole('button')` and `screen.getByLabelText` which query off `document.body` — Dialog portal-rendering does not break these.

- [ ] **Step W2.B5.8: Commit**

```bash
git add src/components/staff/AddCuratedOperatorsModal.jsx src/components/staff/ApprovalReviewModal.jsx src/components/staff/DeleteRequestModal.jsx
git commit -m "feat(modals): 6D B5 — Staff Add+Approval+DeleteRequest migrate to <Dialog>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W2.B6: Migrate Staff `ChangePasswordModal` and retire `ModalShell`

**Files:**
- Modify: `src/components/staff/ChangePasswordModal.jsx` (migrate the modal itself; delete `ModalShell` export)

**Pre-condition:** B5 must be merged to working branch first. After B5, `ModalShell` consumers are: only `ChangePasswordModal` itself (self-use).

- [ ] **Step W2.B6.1: Verify ModalShell consumers**

```bash
grep -rn "ModalShell" src/
```
Expected: only matches inside `src/components/staff/ChangePasswordModal.jsx` itself (definition + self-use). If any other file still imports `ModalShell`, stop — that file should have been migrated in B5.

- [ ] **Step W2.B6.2: Replace entire `ChangePasswordModal.jsx`**

Replace the entire file with:

```jsx
import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ChangePasswordModal({ userId, onClose, onDone }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('Пароль минимум 6 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('change_staff_password', {
      p_caller_id: user.id, p_user_id: userId, p_new_password: password,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    onDone?.()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Сменить пароль</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Новый пароль</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Повторите</span>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm text-[var(--danger-ink)]">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Сохранение…' : 'Сменить'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Note: this file no longer exports `ModalShell`. The `X` import from `lucide-react` is also dropped.

- [ ] **Step W2.B6.3: Verify ModalShell is gone**

```bash
grep -rn "ModalShell" src/
```
Expected: 0 matches.

```bash
grep -nE 'fixed inset-0|role="dialog"' src/components/staff/ChangePasswordModal.jsx
```
Expected: empty.

- [ ] **Step W2.B6.4: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W2.B6.5: Run tests**

```bash
npm run test:run
```
Expected: all pass (no test file directly covers ChangePasswordModal; B5 already verified DeleteRequestModal tests).

- [ ] **Step W2.B6.6: Commit**

```bash
git add src/components/staff/ChangePasswordModal.jsx
git commit -m "feat(modals): 6D B6 — Staff ChangePasswordModal migrates to <Dialog>; retire ModalShell

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W2.B7: Migrate Teams `AddClientsModal` + `ChangeLeadModal` + `AddMemberModal`

**Files:**
- Modify: `src/components/teams/AddClientsModal.jsx`
- Modify: `src/components/teams/ChangeLeadModal.jsx`
- Modify: `src/components/teams/AddMemberModal.jsx`

**Per-file specifics:**

| File | `<DialogContent>` className | Submit button | Notes |
|---|---|---|---|
| `AddClientsModal` | `flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | "Добавить (N)" → default | preserves `max-h-[80vh]` from existing |
| `ChangeLeadModal` | `flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | submit button text per source → default | preserves `max-h-[80vh]` |
| `AddMemberModal` | `flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg` | submit button text per source → default | preserves `max-h-[80vh]` |

All three follow the same list-picker recipe as W2.B4. Preserve existing per-file body content (search bars, list rendering helpers, etc.).

- [ ] **Step W2.B7.1: Read sources**

```bash
cat src/components/teams/AddClientsModal.jsx
cat src/components/teams/ChangeLeadModal.jsx
cat src/components/teams/AddMemberModal.jsx
```

- [ ] **Step W2.B7.2: Migrate `AddClientsModal.jsx`** — apply list-picker recipe (see W2.B4 steps 1-10), substituting per-file specifics.

- [ ] **Step W2.B7.3: Migrate `ChangeLeadModal.jsx`** — same recipe.

- [ ] **Step W2.B7.4: Migrate `AddMemberModal.jsx`** — same recipe.

- [ ] **Step W2.B7.5: Verify removals**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby|closeBtnRef|previouslyFocused' src/components/teams/AddClientsModal.jsx src/components/teams/ChangeLeadModal.jsx src/components/teams/AddMemberModal.jsx
```
Expected: empty.

- [ ] **Step W2.B7.6: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W2.B7.7: Run tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step W2.B7.8: Commit**

```bash
git add src/components/teams/AddClientsModal.jsx src/components/teams/ChangeLeadModal.jsx src/components/teams/AddMemberModal.jsx
git commit -m "feat(modals): 6D B7 — Teams Add{Clients,Member}Modal + ChangeLeadModal migrate to <Dialog>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W2.PR: Open Wave 2 PR

- [ ] **Step W2.PR.1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(modals): Subplan 6D Wave 2 — modals migration + ModalShell retire" --body "$(cat <<'EOF'
## Summary
- Migrate 9 modals to shadcn `<Dialog>` (Subplan 6D, Wave 2 of 3).
- Retire local `ModalShell` helper from `ChangePasswordModal.jsx` (no remaining consumers).
- Destructive variants preserved verbatim per spec §6 (notably `variant="destructive"` for `ApprovalReviewModal` "Одобрить" and `DeleteRequestModal` "Отправить").

## Test plan
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes (DeleteRequestModal tests use portal-safe queries)
- [ ] Preview: in Staff detail panel, open "Сменить пароль" → enter password → submit
- [ ] Preview: open "Перевести в команду" → select → save
- [ ] Preview: open "Сменить куратора" → select moderator → save
- [ ] Preview: as superadmin, open Approval queue → click a request → ApprovalReviewModal — Reject closes, Approve fires destructive
- [ ] Preview: as moderator, click "Запросить удаление" → DeleteRequestModal — submit disabled until 20+ chars
- [ ] Preview: in Team detail, "Добавить клиента", "Сменить лида", "Добавить участника" — all open, search/select, save

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step W2.PR.2: Wait for PR merged** — same `gh auth switch --user clubmonaco2017-ops` flow as Wave 1.

---

## Wave 3 — Slide-outs

Per spec §4.3.

### Task W3.B8: Migrate `clients/CreateClientSlideOut` + `tasks/CreateTaskSlideOut`

**Files:**
- Modify: `src/components/clients/CreateClientSlideOut.jsx`
- Modify: `src/components/tasks/CreateTaskSlideOut.jsx`

**Per-file specifics:**

| File | `<SheetContent>` className | Dirty-confirm |
|---|---|---|
| `CreateClientSlideOut` | `flex w-full flex-col gap-0 sm:max-w-[480px]` | external `<CreateClientCloseConfirm>` (already migrated in Wave 1) |
| `CreateTaskSlideOut` | `flex w-full flex-col gap-0 sm:max-w-[480px]` | inline `CreateTaskCloseConfirm` helper at bottom of same file — migrate inline to `<Dialog>` |

**Recipe — apply to both files:**

1. Add imports: `Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter` from `@/components/ui/sheet`.
2. Wrap return JSX with `<Sheet open onOpenChange={(next) => !next && attemptClose()}><SheetContent side="right" className="...">...</SheetContent></Sheet>`. (Where the existing source uses `attemptClose` — it already exists; for files without dirty-confirm, route directly to `onClose`.)
3. Delete the outer `<div className="fixed inset-0 z-50 bg-black/40" onClick={attemptClose} />` backdrop and the inner `<div role="dialog" aria-modal aria-labelledby className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-card shadow-2xl border-l border-border">` slide-out container — both replaced by `<SheetContent>`.
4. Replace the slide-out's local header `<header className="flex items-center justify-between border-b border-border ...">{title}<button onClick={attemptClose}><X /></button></header>` with `<SheetHeader className="border-b border-border"><SheetTitle>{title}</SheetTitle></SheetHeader>`.
5. Replace bottom `<footer ...>{...buttons...}</footer>` with `<SheetFooter className="border-t border-border">{...buttons...}</SheetFooter>`. Note: `<SheetFooter>` default has `mt-auto flex flex-col gap-2 p-4` — for files that need `flex-row` and `justify-between`, override className.
6. Delete the `useEffect` block that listens for `Escape` and `Cmd/Ctrl+Enter`. **However:** the Cmd/Ctrl+Enter (submit hotkey) listener must be kept — it's a domain hotkey. Keep ONLY that branch:
   ```jsx
   useEffect(() => {
     const onKey = (e) => {
       if (showCloseConfirm) return
       if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
         e.preventDefault()
         handleSubmit()
       }
     }
     window.addEventListener('keydown', onKey)
     return () => window.removeEventListener('keydown', onKey)
   }, [showCloseConfirm, handleSubmit])
   ```
   Drop the `Escape` branch — `<Sheet>` handles it via `onOpenChange`.
7. Keep the initial-focus `useEffect` (e.g., `nameInputRef.current?.focus()`) — it overrides Base UI's default first-focusable.
8. Remove `<button>×</button>` close button from the JSX header (Sheet's built-in `showCloseButton` renders one).

**For Tasks (inline close-confirm migration):** at the bottom of `CreateTaskSlideOut.jsx`, the local `CreateTaskCloseConfirm` component is rewritten to `<Dialog>`:

```jsx
function CreateTaskCloseConfirm({ onCancel, onConfirm }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Отменить создание задачи?</DialogTitle>
          <DialogDescription>Введённые данные будут потеряны.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Продолжить редактирование
          </Button>
          <Button type="button" onClick={onConfirm} autoFocus>
            Отменить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

This is at the bottom of `CreateTaskSlideOut.jsx`. Add `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` to the imports at the top of the file.

- [ ] **Step W3.B8.1: Read both sources fully**

```bash
cat src/components/clients/CreateClientSlideOut.jsx
cat src/components/tasks/CreateTaskSlideOut.jsx
```
Note exact prop names, dirty-state hooks, and existing `attemptClose` / `handleSubmit` definitions.

- [ ] **Step W3.B8.2: Migrate `CreateClientSlideOut.jsx`**

Apply recipe steps 1-8 above. Specific notes:
- The existing source already exports `attemptClose` (defined inside the component) — keep it.
- The dirty-confirm uses external `<CreateClientCloseConfirm>` component — already migrated in W1.B1. Keep the `{showCloseConfirm && <CreateClientCloseConfirm ... />}` block at the end of the JSX, unchanged.
- The `useEffect` for Esc + Cmd/Ctrl+Enter: keep only the Cmd/Ctrl+Enter branch.
- The `useEffect(() => { nameInputRef.current?.focus() }, [])`: keep.
- `useNavigate` import: keep.
- The `<X>` icon import from lucide: drop (close button is now Sheet's built-in).

- [ ] **Step W3.B8.3: Migrate `CreateTaskSlideOut.jsx`**

Apply recipe steps 1-8 above. The inline `CreateTaskCloseConfirm` helper at the bottom of the file is rewritten as shown above. Add Dialog imports.

- [ ] **Step W3.B8.4: Verify removals**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby' src/components/clients/CreateClientSlideOut.jsx src/components/tasks/CreateTaskSlideOut.jsx
```
Expected: empty.

```bash
grep -nE 'window\.addEventListener.*keydown.*Escape|e\.key === .Escape.' src/components/clients/CreateClientSlideOut.jsx src/components/tasks/CreateTaskSlideOut.jsx
```
Expected: empty (Esc handling delegated to Base UI).

```bash
grep -nE "metaKey.*ctrlKey|e\.key === 'Enter'" src/components/clients/CreateClientSlideOut.jsx src/components/tasks/CreateTaskSlideOut.jsx
```
Expected: 1 match per file (the preserved Cmd/Ctrl+Enter submit hotkey).

- [ ] **Step W3.B8.5: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W3.B8.6: Run tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step W3.B8.7: Commit**

```bash
git add src/components/clients/CreateClientSlideOut.jsx src/components/tasks/CreateTaskSlideOut.jsx
git commit -m "feat(modals): 6D B8 — Clients/Tasks CreateSlideOut migrate to <Sheet>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W3.B9: Migrate `teams/CreateTeamSlideOut` + `staff/CreateStaffSlideOut`

**Files:**
- Modify: `src/components/teams/CreateTeamSlideOut.jsx`
- Modify: `src/components/staff/CreateStaffSlideOut.jsx`

**Per-file specifics:**

| File | `<SheetContent>` className | Dirty-confirm |
|---|---|---|
| `CreateTeamSlideOut` | `flex w-full flex-col gap-0 sm:max-w-[440px]` | none — close immediate |
| `CreateStaffSlideOut` | `flex w-full flex-col gap-0 sm:max-w-[480px]` | none — close immediate |

Both files have NO dirty-confirm flow. The `onOpenChange` handler routes directly to `onClose` (no `attemptClose` indirection):

```jsx
<Sheet open onOpenChange={(next) => !next && !submitting && onClose()}>
```

(Replace `submitting` with the actual existing submitting/busy state variable name from each file.)

- [ ] **Step W3.B9.1: Read sources**

```bash
cat src/components/teams/CreateTeamSlideOut.jsx
cat src/components/staff/CreateStaffSlideOut.jsx
```

- [ ] **Step W3.B9.2: Migrate `CreateTeamSlideOut.jsx`** — apply slide-out recipe (W3.B8 recipe steps 1-8, but skip step 6's "preserve Cmd/Ctrl+Enter branch" if the file has no domain hotkey). Verify the existing `useEffect` for keys: if it only handled Esc, delete the entire `useEffect`. If it also has form-submit hotkey, preserve that branch only.

- [ ] **Step W3.B9.3: Migrate `CreateStaffSlideOut.jsx`** — same.

- [ ] **Step W3.B9.4: Verify removals**

```bash
grep -nE 'fixed inset-0|role="dialog"|aria-modal|aria-labelledby' src/components/teams/CreateTeamSlideOut.jsx src/components/staff/CreateStaffSlideOut.jsx
```
Expected: empty.

```bash
grep -rln "fixed inset-0" src --include="*.jsx" | grep -vE "(components/ui/|AdminLayout\.jsx|components/ui\.jsx|PhotoGalleryTab|VideoGalleryTab|ClientLightbox)"
```
Expected: empty (this is the project-wide acceptance check from spec §8 — at end of Wave 3 there should be 0 in-scope hand-rolled overlays remaining).

- [ ] **Step W3.B9.5: Run lint**

```bash
npm run lint
```
Expected: exit 0.

- [ ] **Step W3.B9.6: Run tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step W3.B9.7: Commit**

```bash
git add src/components/teams/CreateTeamSlideOut.jsx src/components/staff/CreateStaffSlideOut.jsx
git commit -m "feat(modals): 6D B9 — Teams/Staff CreateSlideOut migrate to <Sheet>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task W3.PR: Open Wave 3 PR (final)

- [ ] **Step W3.PR.1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(modals): Subplan 6D Wave 3 — slide-outs migration" --body "$(cat <<'EOF'
## Summary
- Migrate 4 slide-outs to shadcn `<Sheet side="right">` (Subplan 6D, Wave 3 of 3 — final).
- Clients dirty-confirm uses already-migrated `<CreateClientCloseConfirm>` `<Dialog>`; Tasks inline close-confirm migrated in place.
- Teams and Staff slide-outs have no dirty-confirm — close routes directly to `onClose`.
- Domain hotkeys (Cmd/Ctrl+Enter submit) preserved; Esc handling delegated to Base UI.

## Acceptance (spec §8)
- 20 files migrated; 2 new sibling files created (Wave 1).
- `ModalShell` deleted (Wave 2).
- Project-wide grep for `fixed inset-0` (excluding out-of-scope files) returns 0 hits.

## Test plan
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] Preview: open Create Client → enter name → Esc → CreateClientCloseConfirm appears above sheet, Esc cancels confirm → returns to sheet, "Закрыть без сохранения" closes
- [ ] Preview: open Create Client → fill all fields → Cmd+Enter → submits
- [ ] Preview: open Create Task → enter text → backdrop click → close-confirm appears
- [ ] Preview: open Create Team → close immediately (no confirm)
- [ ] Preview: open Create Staff → close immediately

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step W3.PR.2: Wait for PR merged** — same `gh auth switch --user clubmonaco2017-ops` flow.

---

## Per-bucket review checklist (for code-reviewer subagent)

After each bucket's implementation commit, dispatch the `superpowers:code-reviewer` subagent with this checklist:

1. ✅ All `<div className="fixed inset-0 ...">` overlay wrappers removed in modified files.
2. ✅ No remaining `useEffect` for Esc/keydown overlay listeners. Domain hotkeys (Cmd/Ctrl+Enter for submit) excepted but verified to be the only remaining listener content.
3. ✅ No remaining manual `role="dialog"`, `aria-modal`, `aria-labelledby` on JSX elements.
4. ✅ No remaining manual close `<button onClick={onClose}><X /></button>` in JSX (replaced by primitive's `showCloseButton`).
5. ✅ Destructive button variants match spec §6 verbatim per file. Specifically: `ApprovalReviewModal` "Одобрить" = `variant="destructive"`; `DeleteRequestModal` "Отправить" = `variant="destructive"`; everywhere else preserves existing variant.
6. ✅ `<DialogContent>` / `<SheetContent>` width is **explicitly set** (not relying on default `sm:max-w-sm`).
7. ✅ Existing tests in the bucket pass (e.g., `DeleteRequestModal.test.jsx` for B5).
8. ✅ For Wave 3: `attemptClose` flow for dirty slide-outs (Clients, Tasks) correctly calls confirm-dialog when `isDirty`, calls `onClose` directly when not dirty.
9. ✅ For B6: `grep -rn "ModalShell" src/` returns 0.
10. ✅ Imports cleaned up: `useEffect`, `useRef`, `X` from lucide-react dropped where unused.

## Per-Wave preview verification

After all buckets in a Wave merge to working branch (before opening Wave PR), run preview-tools verification:

```bash
# preview server
preview_start
```

For each migrated file in the Wave, exercise the dialog/sheet:
- Esc closes (or triggers confirm for dirty slide-outs)
- Backdrop click closes (or triggers confirm)
- Tab cycles within the dialog (focus trap)
- Initial focus lands on the expected element
- For confirm-on-confirm (Wave 3 Clients/Tasks): both layers stack correctly, focus transfers properly
- For destructive actions: button color matches spec §6 table

If any case fails, file a follow-up task in the Wave's PR description rather than mid-Wave hotfix.

## Notes for the executing engineer

- **Read the spec** ([2026-04-27-crm-subplan-6d-modals-migration-design.md](../specs/2026-04-27-crm-subplan-6d-modals-migration-design.md)) before starting any bucket. The spec contains the recipes; this plan contains the per-bucket file deltas.
- **Do NOT touch DS tokens inside file bodies.** This is a structural migration. Residual `text-slate-*` / `bg-indigo-*` inside Staff modals is Family C continuation work, out of scope.
- **Preserve verbatim:** prop names, callback signatures, helper function names, JSX comment bands, `aria-*` attributes on inner form elements (only the wrapper-level `role="dialog"` and `aria-modal` go).
- **B5 must merge before B6.** B5 removes `ModalShell` consumers; B6 deletes the export. If you start B6 before B5 lands, `grep -rn "ModalShell"` will return non-zero and B6's pre-condition fails.
- **PRs merged via `clubmonaco2017-ops` auth** per memory `project_gh_auth.md`. Switch back to `temashdesign` after each merge.
