# Subplan 6D — Hand-rolled overlays → shadcn `<Dialog>` / `<Sheet>` migration

**Status:** Design — pending implementation plan
**Date:** 2026-04-27
**Continuation of:** Subplan 6 (foundation) → 6A* (shells) → 6B1-6B4 (sub-components DS sweep) → 6C (`.btn-*` cleanup spec)
**Out of scope, deferred:** 6D2 — Lightbox migration (`clients/ClientLightbox.jsx`, see §7)

## 1. Problem

The codebase has 20 hand-rolled overlay components (modals, confirm dialogs, slide-outs) implemented as `<div className="fixed inset-0 z-50 bg-black/...">` wrappers with manual:
- Esc/keydown listeners (`useEffect` + `window.addEventListener`)
- Focus management (`useRef + .focus()`)
- ARIA attributes (`role="dialog"`, `aria-modal`, `aria-labelledby`)
- Backdrop click handling
- Z-index stacking (`z-50`, `z-[60]`)

This duplicates logic that the shadcn `<Dialog>` / `<Sheet>` primitives (already installed at `src/components/ui/dialog.jsx` and `src/components/ui/sheet.jsx`, based on `@base-ui/react`) handle correctly out of the box.

In addition, `staff/ChangePasswordModal.jsx` exports a local `ModalShell` helper (lines 69-80) used by `ApprovalReviewModal` and `DeleteRequestModal` — a hand-rolled mini-Dialog. After migration this helper becomes dead code.

This subplan replaces all 20 hand-rolled overlays with the shadcn primitives and retires `ModalShell`.

## 2. Scope

**In:**
- 7 confirm dialogs (Wave 1)
- 9 modals (Wave 2)
- 4 slide-outs (Wave 3)
- Retire `ModalShell` export from `staff/ChangePasswordModal.jsx`
- Extract two inline confirms from `teams/TeamMembersTab.jsx` and `teams/TeamClientsTab.jsx` into sibling files (consistent with the rest of the `teams/` confirm dialogs already living as separate files)

**Out (explicit, with reason):**
- `clients/ClientLightbox.jsx` — full-screen viewer with arrow navigation and caption-edit mode. Different shape (`Dialog` with custom sizing, hotkey policy, edit-mode focus juggling). Deferred to **Subplan 6D2**, separate brainstorm.
- `src/components/ui.jsx` `<Modal>` helper (consumers: `AdminPanel`, `sections/PlatformsSection`, `sections/AgenciesSection`) — Subplan 7 (legacy AdminLayout cleanup) territory.
- `src/AdminLayout.jsx` `fixed inset-0` — full-screen layout overlay, not a modal.
- Gallery menu scrims at `clients/PhotoGalleryTab.jsx:640` and `clients/VideoGalleryTab.jsx:771` — `z-30` click-catchers for context menus, candidates for `<DropdownMenu>` swap in a separate mini-subplan.
- DS-token swap **inside the body** of any migrated modal (residual `text-slate-*` / `bg-indigo-*` etc.). 6D is a structural migration (overlay → primitive). Token-content swaps are Family C continuations (e.g., for Staff the 6A8 follow-up note tracks this).
- Staff `DetailPanel` `bg-emerald-100` status-pill bug (memory note) — cosmetic, deferred until DS revamp.

## 3. Architecture

### 3.1 Primitives

Already in `src/components/ui/`:
- `dialog.jsx` — `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<DialogFooter>`, `<DialogClose>`
- `sheet.jsx` — `<Sheet>`, `<SheetContent>` (with `side="left|right|top|bottom"`), `<SheetHeader>`, `<SheetTitle>`, `<SheetDescription>`, `<SheetFooter>`, `<SheetClose>`

Both render via Base UI portals (`@base-ui/react/dialog`), with built-in:
- Esc-to-close (configurable)
- Focus trap + initial focus + focus restoration on close
- Backdrop click-to-close (configurable via `onOpenChange`)
- ARIA roles and attributes
- Animation hooks (`data-open`, `data-closed`, `data-starting-style`, `data-ending-style`)

### 3.2 Control model — single uniform shape

Parents keep the existing **conditional mount** pattern unchanged:

```jsx
{open && <CreateClientSlideOut callerId={...} onClose={() => setOpen(false)} ... />}
```

Inside each migrated component, `open` is hard-coded to `true` (the component is only mounted when open). `onOpenChange(false)` triggers the existing `onClose` prop:

```jsx
<Sheet open onOpenChange={(next) => !next && onClose()}>
  <SheetContent side="right" className="sm:max-w-[480px]">
    ...
  </SheetContent>
</Sheet>
```

For Dialog the same shape applies, except `<Sheet>` → `<Dialog>` and `<SheetContent>` → `<DialogContent>`.

**Consequence — what's removed per file:**
- The `<div className="fixed inset-0 z-... bg-black/...">` overlay wrapper
- Manual `useEffect` listeners for Esc / keydown overlay-management (domain hotkeys like Cmd/Ctrl+Enter stay)
- Manual `useRef` + `.focus()` calls for focus trap (specific initial-focus targets like a name input stay — see §3.4)
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-modal` on the wrapper (the primitive sets them)
- Manual close `<button>` rendering in the corner — replaced by `showCloseButton` prop on `<DialogContent>` / `<SheetContent>` (default `true`)
- Manual `onClick` backdrop-close handling — handled by primitive

### 3.3 Dirty-state confirm flow (slide-outs only)

Three of the four slide-outs preserve their existing close-confirm UX:
- **Clients:** uses external `CreateClientCloseConfirm.jsx` (separate file, migrated in Wave 1)
- **Tasks:** has an inline `CreateTaskCloseConfirm` helper at the bottom of `CreateTaskSlideOut.jsx` (migrated **in place** in Wave 3, alongside the slide-out)
- **Teams:** **no dirty-confirm** — close is immediate (form is short, comment in source: "Esc → close (без confirm — форма короткая, риск потери минимален)"). This stays as-is.
- **Staff:** **no dirty-confirm** — close is immediate. Stays as-is.

For Clients and Tasks, the flow becomes:

```jsx
function attemptClose() {
  if (isDirty) setShowCloseConfirm(true)
  else onClose()
}

<Sheet open onOpenChange={(next) => !next && attemptClose()}>
  <SheetContent side="right" ...>...</SheetContent>
</Sheet>

{showCloseConfirm && (
  <CreateClientCloseConfirm
    onContinue={() => setShowCloseConfirm(false)}
    onDiscard={() => { setShowCloseConfirm(false); onClose(); }}
  />
)}
```

`CreateClientCloseConfirm` is a `<Dialog>` after Wave 1 (and the inline Tasks variant becomes one in Wave 3). Base UI portals stack later-mounted dialogs on top, so the close-confirm appears above the sheet correctly without manual z-index manipulation. Focus trap transfers to the confirm; on cancel, focus returns to the previously focused element inside the sheet (Base UI per-popup focus restoration).

### 3.4 Initial focus

Base UI auto-focuses the first focusable element inside `<DialogContent>` / `<SheetContent>`. Where the existing implementation explicitly focuses a specific element on open (e.g., name input in `CreateClientSlideOut`, search input in `AddCuratedOperatorsModal`), the existing `useEffect(() => ref.current?.focus(), [])` is **kept** — it runs after Base UI's initial focus and overrides it. Domain initial-focus targets are preserved. The window-level `keydown` listener for Esc is **removed**.

### 3.5 Domain hotkeys

Cmd/Ctrl+Enter (form submit) is a domain shortcut, not overlay management. Its `useEffect` listener is **kept** in the migrated slide-outs. Only the Esc handler inside the same listener is removed (Base UI handles Esc through the primitive).

## 4. Per-type recipes

### 4.1 Confirm dialogs (Wave 1, 7 files)

**Files:**
1. `src/components/clients/CreateClientCloseConfirm.jsx`
2. `src/components/clients/ArchiveConfirmDialog.jsx`
3. `src/components/tasks/DeleteTaskConfirmDialog.jsx`
4. `src/components/tasks/CancelTaskConfirmDialog.jsx`
5. `src/components/teams/ArchiveTeamConfirmDialog.jsx`
6. `src/components/teams/RemoveMemberConfirmDialog.jsx` — **new file**, extracted from `teams/TeamMembersTab.jsx:174`
7. `src/components/teams/RemoveClientConfirmDialog.jsx` — **new file**, extracted from `teams/TeamClientsTab.jsx:142`

**Recipe:**

```jsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function ArchiveConfirmDialog({ clientName, onCancel, onConfirm, busy }) {
  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Архивировать клиента?</DialogTitle>
          <DialogDescription>
            {clientName} перестанет показываться в списке активных. Это можно
            отменить — снова сделать клиента активным в любой момент.
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
            {busy ? 'Архивируем…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Inline-confirm extract (B3):** the implementation subagent for bucket B3 must:
1. Read `teams/TeamMembersTab.jsx:174` and `teams/TeamClientsTab.jsx:142`. Identify the inline confirm JSX block, the local state hook driving it (e.g., `removeTarget`/`removingId`), and any closure props (`onConfirm` callback) it depends on.
2. Create `teams/RemoveMemberConfirmDialog.jsx` and `teams/RemoveClientConfirmDialog.jsx` mirroring the recipe above.
3. Replace the inline JSX in the parent tab with `{removeTarget && <RemoveMemberConfirmDialog ... />}` and the import.
4. Verify the parent tab files still pass `npm run lint` and any related tests; the JSX extraction must be behaviorally identical.

### 4.2 Modals (Wave 2, 9 files)

**Files:**
- Staff: `ChangeTeamModal`, `ChangeCuratorModal`, `AddCuratedOperatorsModal`, `ApprovalReviewModal`, `DeleteRequestModal`, `ChangePasswordModal`
- Teams: `AddClientsModal`, `ChangeLeadModal`, `AddMemberModal`

**Recipe — simple form modal (e.g., `ChangePasswordModal`):**

```jsx
<Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Сменить пароль</DialogTitle>
    </DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      {/* form body */}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>
          Отмена
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Сохранение…' : 'Сменить'}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

**Recipe — list-picker modal with custom header/footer (e.g., `ChangeTeamModal`, `ChangeCuratorModal`, `AddCuratedOperatorsModal`, Teams `AddClientsModal`/`ChangeLeadModal`/`AddMemberModal`):**

These modals have a complex three-region layout (border-divided header / scrollable list body / sticky footer) with the existing structure `flex w-full max-w-lg flex-col overflow-hidden ... max-h-[80vh|90vh]`. Use `<DialogContent>` with custom class overrides:

```jsx
<Dialog open onOpenChange={(next) => !next && !submitting && onClose()}>
  <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
    {/* Use max-h-[80vh] for Teams modals (preserve existing per-file value) */}
    <DialogHeader className="border-b border-border px-5 py-4">
      <DialogTitle>Перевести в другую команду</DialogTitle>
    </DialogHeader>
    {error && (
      <div role="alert" className="border-b border-border bg-[var(--danger-soft)] px-5 py-2 text-xs text-[var(--danger-ink)]">
        {error}
      </div>
    )}
    <div className="flex-1 overflow-auto">
      {/* list body */}
    </div>
    <DialogFooter className="border-t border-border bg-muted/40 px-5 py-3">
      <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
        Отмена
      </Button>
      <Button size="sm" onClick={handleSubmit} disabled={submitting || selected == null}>
        {submitting ? 'Сохраняем…' : 'Сохранить'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Notes:
- `<DialogContent>` defaults to `p-4` and `gap-4`; for the list-picker shape we override with `p-0 gap-0` so each region (header / error / body / footer) controls its own padding.
- `<DialogContent>` defaults to `sm:max-w-sm` — must be explicitly widened to `sm:max-w-md` (simple modals) or `sm:max-w-lg` (list pickers).
- `<DialogFooter>` default `bg-muted/50` border-t styling matches the existing list-picker footer; for simple form modals, `<DialogFooter>` styling is already correct.
- The custom `<header><button onClick={onClose}><X /></button></header>` close button used by list-picker modals is replaced by the primitive's `showCloseButton` prop (default `true`).

**`ModalShell` retirement:** `ApprovalReviewModal` and `DeleteRequestModal` currently `import { ModalShell } from './ChangePasswordModal.jsx'`. Bucket order in Wave 2 (see §5):
- B5 (Approval + DeleteRequest) — replace `<ModalShell>` with `<Dialog>` + `<DialogContent>` + `<DialogHeader>` + `<DialogTitle>`. The `ModalShell` export remains exported (still used by `ChangePasswordModal` itself).
- B6 (ChangePasswordModal alone) — migrate `ChangePasswordModal`'s self-use, then **delete the `export function ModalShell(...)` block** (lines 69-80 of the source). Subagent must `grep -rn "ModalShell" src/` post-migration to confirm 0 remaining consumers before deletion.

### 4.3 Slide-outs (Wave 3, 4 files)

**Files:**
1. `src/components/clients/CreateClientSlideOut.jsx` — uses external `CreateClientCloseConfirm`
2. `src/components/tasks/CreateTaskSlideOut.jsx` — has inline `CreateTaskCloseConfirm` helper
3. `src/components/teams/CreateTeamSlideOut.jsx` — no dirty-confirm
4. `src/components/staff/CreateStaffSlideOut.jsx` — no dirty-confirm

**Recipe (Clients example with full dirty-confirm flow):**

```jsx
<Sheet open onOpenChange={(next) => !next && attemptClose()}>
  <SheetContent
    side="right"
    className="flex w-full flex-col gap-0 sm:max-w-[480px]"
    /* Teams uses sm:max-w-[440px], all others sm:max-w-[480px] */
  >
    <SheetHeader className="border-b border-border">
      <SheetTitle>Создать клиента</SheetTitle>
    </SheetHeader>
    <div className="flex-1 overflow-y-auto p-4">
      {/* form body */}
    </div>
    <SheetFooter className="border-t border-border">
      <Button variant="ghost" onClick={attemptClose} disabled={submitting}>
        Отмена
      </Button>
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? 'Создаём…' : 'Создать'}
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>

{showCloseConfirm && (
  <CreateClientCloseConfirm
    onContinue={() => setShowCloseConfirm(false)}
    onDiscard={() => { setShowCloseConfirm(false); onClose(); }}
  />
)}
```

**Per-file widths (preserve existing):**
| File | Current | Target `<SheetContent>` className |
|---|---|---|
| `CreateClientSlideOut` | `max-w-[480px]` | `sm:max-w-[480px]` |
| `CreateTaskSlideOut` | `max-w-[480px]` | `sm:max-w-[480px]` |
| `CreateTeamSlideOut` | `max-w-[440px]` | `sm:max-w-[440px]` |
| `CreateStaffSlideOut` | `max-w-[480px]` | `sm:max-w-[480px]` |

**Tasks inline close-confirm migration:** the helper at the bottom of `CreateTaskSlideOut.jsx` (currently a `<>` fragment with two `<div>`s, one backdrop and one alertdialog body) is rewritten in place to `<Dialog>` + `<DialogContent>`, keeping its export shape and the parent's `{showCloseConfirm && <CreateTaskCloseConfirm ... />}` usage.

**Domain hotkeys preserved:** Cmd/Ctrl+Enter in `CreateClientSlideOut.jsx:95-97` (and equivalent in others) — keep the listener, but remove the Esc branch from the same `useEffect` (Base UI handles Esc).

**Initial focus preserved:** name input focus in `CreateClientSlideOut.jsx:71` (`nameInputRef.current?.focus()`) — keep.

## 5. Execution plan

### 5.1 Wave structure

| Wave | Type | Files | Buckets | Subagent pairs |
|---|---|---|---|---|
| 1 | confirms | 7 | 3 | 6 (impl + review per bucket) |
| 2 | modals | 9 | 4 | 8 |
| 3 | slide-outs | 4 | 2 | 4 |

**Total:** 18 subagent invocations. Comparable to 6B1 (~14 files, similar paired-review cadence).

### 5.2 Bucket breakdown

**Wave 1 — confirms (3 buckets):**
- **B1** — `clients/CreateClientCloseConfirm` + `clients/ArchiveConfirmDialog`
- **B2** — `tasks/DeleteTaskConfirmDialog` + `tasks/CancelTaskConfirmDialog` + `teams/ArchiveTeamConfirmDialog`
- **B3** — Extract `teams/RemoveMemberConfirmDialog` (from `TeamMembersTab.jsx:174`) + `teams/RemoveClientConfirmDialog` (from `TeamClientsTab.jsx:142`); update parent tabs to import the new files

**Wave 2 — modals (4 buckets, ordered):**
- **B4** — Staff `ChangeTeamModal` + `ChangeCuratorModal` (no `ModalShell` dependency)
- **B5** — Staff `AddCuratedOperatorsModal` + `ApprovalReviewModal` + `DeleteRequestModal`. **B5 must run before B6.** B5 replaces `ModalShell` consumers in Approval/DeleteRequest with `<Dialog>` directly; the `ModalShell` export still remains in `ChangePasswordModal.jsx` after B5.
- **B6** — Staff `ChangePasswordModal`. Migrate the modal itself, then `grep -rn "ModalShell" src/` (expect 0), delete the `export function ModalShell` block.
- **B7** — Teams `AddClientsModal` + `ChangeLeadModal` + `AddMemberModal`

**Wave 3 — slide-outs (2 buckets):**
- **B8** — `clients/CreateClientSlideOut` + `tasks/CreateTaskSlideOut` (each has dirty-confirm; Clients uses external `CreateClientCloseConfirm` migrated in Wave 1; Tasks has inline `CreateTaskCloseConfirm` helper migrated in place)
- **B9** — `teams/CreateTeamSlideOut` + `staff/CreateStaffSlideOut` (no dirty-confirm)

### 5.3 Subagent task structure (per bucket)

Each bucket = 2 subagent invocations:

**1. Implementation** (`general-purpose` agent)
- Inputs: this spec + bucket file list + per-file destructive-variant decisions (§6)
- Tasks: migrate each file per recipe, run `npm run lint` (must pass), run any colocated tests, commit on the working branch with bucket-prefixed message (e.g., `feat(modals): 6D B5 — Staff Add+Approval+DeleteRequest migrate to <Dialog>`).
- Must NOT touch DS tokens inside file bodies (§2 out-of-scope).

**2. Code review** (`superpowers:code-reviewer` agent)
- Inputs: spec + diff + bucket file list
- Checklist:
  - All `<div className="fixed inset-0 ...">` overlay wrappers removed.
  - No remaining `useEffect` for Esc/keydown overlay listeners (domain hotkeys like Cmd/Ctrl+Enter excepted).
  - No remaining manual `role="dialog"` / `aria-modal` on JSX elements (primitive sets them).
  - No remaining manual close-`<button>` rendering (use `showCloseButton` prop).
  - Destructive button variants match the table in §6.
  - `<DialogContent>` / `<SheetContent>` width is **explicitly set** (not relying on default `sm:max-w-sm`).
  - Existing tests in the bucket (e.g., `DeleteRequestModal.test.jsx`) pass.
  - For Wave 3: verify `attemptClose` flow correctly calls confirm-dialog when `isDirty`, calls `onClose` directly when not dirty.
  - For B6: confirm `ModalShell` export is deleted and `grep -rn "ModalShell" src/` returns 0.

### 5.4 Branch / PR strategy

One PR per Wave (3 PRs total):
- `feat(modals): Subplan 6D Wave 1 — confirm dialogs migration` (after B1+B2+B3)
- `feat(modals): Subplan 6D Wave 2 — modals migration + ModalShell retire` (after B4-B7)
- `feat(modals): Subplan 6D Wave 3 — slide-outs migration` (after B8-B9)

Each PR independently mergeable to `main`; per memory `project_gh_auth.md`, switch to `clubmonaco2017-ops` user before merging.

### 5.5 Verification per Wave

Before opening each Wave's PR:
- `npm run lint` — must pass
- `npm run typecheck` if defined in `package.json`
- `npm test` — full suite, with focus on touched files (e.g., `DeleteRequestModal.test.jsx` for Wave 2)
- Preview-tools manual check: `preview_start`, then for every migrated file open the dialog/sheet, verify:
  - Esc closes (or triggers confirm for dirty slide-outs)
  - Backdrop click closes (or triggers confirm)
  - Tab cycles within the dialog (focus trap)
  - Initial focus lands on the expected element (name input, search, etc.)
  - For confirm-on-confirm (close-confirm over slide-out): both layers stack correctly, focus transfers properly
  - For destructive actions: button color matches the table in §6

Per-Wave preview pass — not per-bucket (one interactive session per Wave).

## 6. Destructive-button variant table

To eliminate ambiguity (and the 6B1-style risk where primary/secondary destructive was inverted), this table fixes the variant for every destructive button in scope. Rule: **preserve the existing variant** as a default; deviations are flagged explicitly.

### Wave 1 — confirms

| File | Button label | Variant | Notes |
|---|---|---|---|
| `clients/CreateClientCloseConfirm` | "Закрыть без сохранения" | `ghost` + danger tokens | secondary destructive; "Продолжить ввод" primary safe (default Button) |
| `clients/CreateClientCloseConfirm` | "Продолжить ввод" | default (no variant) | primary safe path |
| `clients/ArchiveConfirmDialog` | "Архивировать" | `ghost` + danger tokens | preserves existing |
| `tasks/DeleteTaskConfirmDialog` | "Удалить" | `ghost` + danger tokens | preserves existing |
| `tasks/CancelTaskConfirmDialog` | "Отменить задачу" | `ghost` + danger tokens | preserves existing |
| `teams/ArchiveTeamConfirmDialog` | "Архивировать" | `ghost` + danger tokens | preserves existing |
| `teams/RemoveMemberConfirmDialog` (new) | "Убрать" / current label | `ghost` + danger tokens | extract preserves variant from `TeamMembersTab.jsx:174` |
| `teams/RemoveClientConfirmDialog` (new) | "Убрать" / current label | `ghost` + danger tokens | extract preserves variant from `TeamClientsTab.jsx:142` |

"`ghost` + danger tokens" means: `<Button variant="ghost" className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">`.

### Wave 2 — modals

| File | Button label | Variant | Notes |
|---|---|---|---|
| `staff/ChangePasswordModal` | "Сменить" | default | not destructive — state change |
| `staff/ChangeTeamModal` | "Сохранить" | default | not destructive |
| `staff/ChangeCuratorModal` | "Сохранить" | default | not destructive |
| `staff/AddCuratedOperatorsModal` | "Назначить (N)" | default | not destructive |
| `staff/ApprovalReviewModal` | "Одобрить" (approve_deletion) | `destructive` | matches existing source — approving a deletion request is the primary destructive action |
| `staff/ApprovalReviewModal` | "Отклонить" (reject_deletion) | `ghost` | safe secondary path |
| `staff/DeleteRequestModal` | "Отправить" (request deletion) | `destructive` | matches existing source — submit triggers a request to delete a user, primary destructive action |
| `teams/AddClientsModal` | submit | default | not destructive |
| `teams/ChangeLeadModal` | submit | default | not destructive |
| `teams/AddMemberModal` | submit | default | not destructive |

**Implementation note for B5 (ApprovalReviewModal, DeleteRequestModal):** both currently use `variant="destructive"` for their primary destructive action. Preserve verbatim during migration. Do **not** "upgrade" any `ghost`+danger button elsewhere to `variant="destructive"` — that's a UX redesign, out of scope.

### Wave 3 — slide-outs

| File | Destructive paths | Variant |
|---|---|---|
| `clients/CreateClientSlideOut` | none in slide-out itself | — |
| `tasks/CreateTaskSlideOut` | inline close-confirm "Отменить" | default (current source: primary; safe action "Продолжить редактирование" is `ghost`) |
| `teams/CreateTeamSlideOut` | none | — |
| `staff/CreateStaffSlideOut` | none | — |

## 7. Risks and mitigations

**R1 — Z-index stacking during intermediate states.** Hand-rolled overlays use `z-50` / `z-[60]`; Base UI portal uses `z-50` rendered on `<body>`. Browser stacking is by DOM-mount order; later-mounted dialogs stack on top of earlier ones (and on top of legacy hand-rolled overlays still in the same Wave). No regression expected. **Mitigation:** Wave 1/2 review-agent verifies that stacking a not-yet-migrated legacy hand-rolled overlay over a migrated `<Dialog>` produces correct visual order.

**R2 — Close-confirm over slide-out (Wave 3).** Both Sheet and Dialog use Base UI portals at `z-50`. The Dialog mounts later (only when `showCloseConfirm = true`), so it stacks above Sheet. **Mitigation:** Wave 3 review-agent test: open slide-out, dirty form, press Esc — confirm appears above sheet, focus transferred to confirm, cancel returns focus to sheet.

**R3 — Focus-trap interaction in nested dialogs.** Base UI manages focus per popup instance. Opening close-confirm over a slide-out captures focus; canceling restores focus to the previously focused element inside the slide-out. This matches existing behavior. **Mitigation:** review-agent manually verifies focus restoration in Wave 3 preview pass.

**R4 — Destructive-variant misclassification.** 6B1 caught a primary/secondary destructive inversion. **Mitigation:** §6 fixes every destructive button by file + label + variant. Implementation subagent has zero interpretation latitude — match the table verbatim.

**R5 — Sheet width regressions.** Base UI Sheet defaults to `data-[side=right]:sm:max-w-sm`; existing slide-outs use `max-w-[480px]` / `max-w-[440px]`. **Mitigation:** §4.3 width table is explicit; review-agent greps for `sm:max-w-` in each migrated file.

**R6 — Test failures in `DeleteRequestModal.test.jsx`.** Migration changes DOM structure (Dialog renders into a Base UI portal on `<body>`, not the test container). Tests using `container.querySelector` may break. **Mitigation:** B5 implementation subagent runs `npm test src/components/staff/DeleteRequestModal.test.jsx` after migration and rewrites failing queries to use `screen.getByRole('dialog')` or `within(document.body)`.

**R7 — Staff modals not previously DS-swept.** Per the 6A8 follow-up note in `project_ds_rollout_roadmap.md`, Staff modals still contain residual `text-slate-*` / `bg-indigo-*` tokens inside their bodies. 6D migrates **structure only**. If a subagent sees residual legacy tokens inside a modal body during Wave 2, they are NOT touched — that is Family C continuation work.

**R8 — `onOpenChange(true)` triggered on mount.** Base UI may invoke `onOpenChange(true)` synchronously when the popup mounts. The recipe `onOpenChange={(next) => !next && onClose()}` short-circuits on `next === true` and is safe. **Mitigation:** review-agent verifies the lambda guards on `!next`.

## 8. Acceptance criteria

- All 20 in-scope files migrated to `<Dialog>` / `<Sheet>`.
- Two new files created: `teams/RemoveMemberConfirmDialog.jsx`, `teams/RemoveClientConfirmDialog.jsx`. Inline confirms removed from `TeamMembersTab.jsx` and `TeamClientsTab.jsx`.
- `ModalShell` export deleted from `staff/ChangePasswordModal.jsx`. `grep -rn "ModalShell" src/` returns 0 results.
- `grep -rn 'fixed inset-0' src/` excluding `src/components/ui/`, `src/AdminLayout.jsx`, `src/components/ui.jsx`, `src/components/clients/PhotoGalleryTab.jsx`, `src/components/clients/VideoGalleryTab.jsx`, and `src/components/clients/ClientLightbox.jsx` (the explicit out-of-scope items) returns 0 hits.
- All existing tests pass.
- `npm run lint` passes after each Wave.
- Preview-tools verification per §5.5 passes for all three Waves.
- 3 PRs merged to `main` (Wave 1 → Wave 2 → Wave 3 in order).

## 9. Open questions

None. All decisions captured during brainstorm:
- Scope = 20 files (Lightbox deferred to 6D2)
- Control model = conditional mount preserved, `<Sheet open={true}>` controlled by `onOpenChange`
- Dirty-confirm = nested Dialog over Sheet
- `ModalShell` retire in B6
- Execution = subagent-driven, paired review per bucket
- Bucket grouping = by type, ordered confirms → modals → slide-outs
- Destructive variants = table in §6 (preserve existing per file)
