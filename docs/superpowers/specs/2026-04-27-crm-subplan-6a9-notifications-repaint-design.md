# CRM Subplan 6A9 — NotificationsPage repaint · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family B second sweep. Pure DS-token swap of the standalone `NotificationsPage`.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens + shadcn `<Button>`.
- [Subplan 6A4 ClientList spec](2026-04-27-crm-subplan-6a4-clientlist-repaint-design.md) — established «pure token swap» Family A pattern; reused here for a Family B page that doesn't need architectural migration.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind-палитру (`slate-*`, `bg-indigo-600`, `text-red-500`, `bg-white`, `dark:bg-slate-800`) и raw `<button>` в `src/pages/NotificationsPage.jsx` (71 LOC) на DS-токены и shadcn `<Button>`. Без структурных изменений — страница остаётся standalone центрированной (`max-w-3xl`), потому что семантически это inbox-список, а не master-detail roster.

**В scope (1 файл):**
- `src/pages/NotificationsPage.jsx` — token swap всех legacy-классов:
  - h1 `text-slate-800 dark:text-slate-100` → `text-foreground`
  - h2 + loading + count `text-slate-500` → `text-muted-foreground`
  - error `text-red-500` → `text-[var(--danger-ink)]` + `role="alert"` для a11y
  - empty card `border-dashed border-slate-200 dark:border-slate-700` → `border-dashed border-border-strong`
  - empty card text `text-slate-500` → `text-muted-foreground`
  - item card `border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800` → `border-border bg-card`
  - item name `text-slate-800 dark:text-slate-100` → `text-foreground`
  - ref_code mono `text-slate-400` → `text-[var(--fg4)]`
  - subtitle `text-slate-500 dark:text-slate-400` → `text-muted-foreground`
  - reason `text-slate-600 dark:text-slate-400` → `text-muted-foreground`
  - "Рассмотреть" `<button className="bg-indigo-600 ... hover:bg-indigo-700">` → shadcn `<Button size="sm">`
  - "Недоступно" `text-slate-500` → `text-muted-foreground`

**Out of scope (deferred):**
- **`ApprovalReviewModal` DS-token swap** — модалка остаётся с legacy slate/indigo. Отдельный subplan вместе с прочими Staff-модалками (`ChangePasswordModal`, `DeleteRequestModal` и т.д.).
- **Архитектурный refactor:** redirect на `/` для non-superadmin вместо текстового сообщения «Недоступно», переход на `MasterDetailLayout`, добавление notification-grouping / filtering / multi-type — текущая страница имеет один источник (deletion requests). Расширение делать когда появится второй тип нотификаций.
- **Финальный cleanup `.btn-primary/.btn-ghost/.btn-danger-ghost` в `src/index.css`** — после Family B полностью (LoginPage остаётся).

---

## 2. File-level diff summary

**Modified (1):**
- `src/pages/NotificationsPage.jsx` — token swap, добавлен импорт `{ Button }` из `@/components/ui/button`, замена raw `<button>` на `<Button>`. Логика и структура без изменений.

**Created:** none.
**Removed:** none.

**Estimated PR size:** ~25-30 lines diff.

---

## 3. Behavior contracts (preserved)

| Behavior | Status |
|---|---|
| Non-superadmin → "Недоступно" сообщение (без redirect) | preserved |
| `useDeletionRequests(user.id, 'pending')` → `{ rows, loading, error, reload }` | preserved |
| Loading state: «Загрузка…» текст | preserved |
| Error state: «Ошибка: {msg}» текст | preserved (+ `role="alert"`) |
| Empty state: «Нет запросов на рассмотрение» dashed-border | preserved |
| List rendering: card per request with name + ref_code + requester + timestamp + reason | preserved |
| "Рассмотреть" → opens `<ApprovalReviewModal>` with current request | preserved |
| Modal `onDone` → `reload()` | preserved |

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes).
- Browser preview `/notifications` (as superadmin):
  - Empty state renders with dashed border + DS-token text colors.
  - List items render with DS-token surface (`bg-card`, `border-border`).
  - "Рассмотреть" button uses shadcn `<Button>` styling.
  - Click "Рассмотреть" → `ApprovalReviewModal` opens unchanged.
- Browser preview `/notifications` (as non-superadmin): «Недоступно» renders with `text-muted-foreground`.
- No new lint warnings in `NotificationsPage.jsx`.

---

## 5. Implementation order

Single-task PR (no TDD needed — pure visual swap):

1. Edit `src/pages/NotificationsPage.jsx`:
   a. Add `import { Button } from '@/components/ui/button'`.
   b. Apply 11 token replacements per §1 table.
   c. Replace raw `<button>` element with `<Button size="sm" onClick={...}>Рассмотреть</Button>`.
   d. Add `role="alert"` to error `<p>`.
2. Verify `npm run build` clean.
3. Verify `npm test -- --run` 235/235.
4. Browser preview: empty state, list state, click "Рассмотреть" → modal.
5. Commit + push + PR.
