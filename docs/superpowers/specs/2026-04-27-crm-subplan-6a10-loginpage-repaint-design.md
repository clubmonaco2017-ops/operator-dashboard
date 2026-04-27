# CRM Subplan 6A10 — LoginPage repaint · Design Spec

**Status:** Brainstormed · approved decisions · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-27.
**Implements:** Domain model §8 row 6 (design-system rollout) — Family B final sweep. Pure DS-token swap of the standalone unauthenticated `LoginPage`.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — DS tokens + shadcn `<Button>` / `<Input>` + lucide icon convention.
- [Subplan 6A9 NotificationsPage spec](2026-04-27-crm-subplan-6a9-notifications-repaint-design.md) — established the standalone-page repaint pattern reused here.

---

## 1. Goal & non-goals

**Goal:** Заменить legacy Tailwind palette (`slate-*`, `bg-indigo-600`, `text-red-*`, `bg-red-50`), raw `<input>`/`<button>` элементы и inline SVG icons в `src/LoginPage.jsx` (103 LOC) на DS-токены, shadcn primitives (`<Input>`, `<Button>`) и lucide icons (`AlertCircle`, `Loader2`). Без структурных изменений — full-screen centered card layout сохраняется (`min-h-screen` / `max-w-sm` card).

**В scope (1 файл):**

`src/LoginPage.jsx` — token swap + primitive swap + icon swap:

| Surface | Текущее | Новое |
|---|---|---|
| Page background | `bg-slate-100 dark:bg-slate-900` | `bg-background` |
| Logo container | `bg-indigo-600` + raw white text | `bg-primary text-primary-foreground` |
| Title h1 | `text-slate-900 dark:text-slate-100` | `text-foreground` |
| Subtitle | `text-slate-400` | `text-muted-foreground` |
| Card surface | `bg-white dark:bg-slate-800` | `bg-card` |
| Card border | `border-slate-200 dark:border-slate-700` | `border-border` |
| Input labels | `text-slate-600 dark:text-slate-400` | `text-muted-foreground` |
| Email + Password inputs | raw `<input>` with custom slate/indigo styling | shadcn `<Input>` |
| Error icon | inline SVG warning circle | `<AlertCircle size={16} />` (lucide) |
| Error block bg | `bg-red-50 dark:bg-red-900/20` + `border-red-200 dark:border-red-800` | `bg-[var(--danger-soft)] border-[var(--danger-strong)]` |
| Error text | `text-red-600 dark:text-red-400` | `text-[var(--danger-ink)]` |
| Submit button | raw `<button>` with `bg-indigo-600 hover:bg-indigo-700` | shadcn `<Button>` default variant, full-width via `className="w-full"` |
| Loading spinner | inline SVG with hand-rolled animation | `<Loader2 size={16} className="animate-spin" />` (lucide) |

**Behaviour preserved:**

- Submit handler логика (валидация: `email.trim() && password.length`)
- Error state lifecycle (`setError(null)` on submit start, `setError(message)` on failure)
- `submitting || loading` busy gate disables form
- `autoFocus` на email
- `required` атрибуты на обоих полях
- `onLogin(email.trim(), password)` контракт
- Default export (`export default function LoginPage`)
- File location `src/LoginPage.jsx` (не двигаем в `src/pages/`)

**Out of scope (deferred):**

- **Refactor file location** (`src/LoginPage.jsx` → `src/pages/LoginPage.jsx`). Файл живёт в корне `src/` исторически; перенос требует обновления App.jsx import. YAGNI — не нужно для DS swap.
- **Социальная аутентификация / SSO**, "Забыли пароль?", "Запомнить меня" чекбокс. Текущий продукт ничего из этого не требует.
- **Error a11y `role="alert"`** на error-block — стоит добавить как часть repaint, single-line addition.
- **Финальный cleanup `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` в `src/index.css`** — отдельный финальный subplan после 6A10. Эти классы всё ещё используются в clients/tasks/teams detail-табах и slide-outs (verified via grep), которые не входят в скоуп Family B.

---

## 2. File-level diff summary

**Modified (1):**
- `src/LoginPage.jsx` — token swap + shadcn `<Input>` × 2 + shadcn `<Button>` × 1 + lucide `<AlertCircle>` + `<Loader2>` + добавлен `role="alert"` на error block. Логика и структура без изменений.

**Created:** none.
**Removed:** none.

**Estimated PR size:** ~50-60 lines diff (replacing 2 raw inputs and 1 raw button with shadcn primitives shrinks className strings significantly).

---

## 3. Behaviour contracts (preserved)

| Behaviour | Status |
|---|---|
| `onLogin(email, password)` async contract returning `{ success, error }` | preserved |
| Submit blocked if `!email.trim() || !password` | preserved |
| Error message displayed inline with icon, dismissed on next submit | preserved (+ `role="alert"`) |
| Loading state: spinner + "Вход..." text on button, disabled inputs | preserved |
| `loading` prop from parent (`useAuth`) blocks form same as local `submitting` | preserved |
| `autoFocus` на email | preserved |

---

## 4. Acceptance criteria

- `npm run build` clean.
- `npm test -- --run` 235/235 still passing (no test changes; existing `useAuth.test.jsx` covers login flow at hook level).
- Browser preview `/` (logged out):
  - Page renders with `bg-background`, centered card with `bg-card`/`border-border`.
  - Logo container uses `bg-primary` colour.
  - Email + password inputs render as shadcn `<Input>` with focus-ring DS token.
  - Submit button renders as shadcn `<Button>` default variant.
- Error path: invalid credentials → error block appears with lucide `AlertCircle` icon and `var(--danger-ink)` text.
- Loading state: clicking Submit triggers `<Loader2>` spinner + "Вход..." label, button disabled.
- No new lint warnings in `LoginPage.jsx`.

---

## 5. Implementation order

Single-task PR (no TDD — pure visual + primitive swap):

1. Edit `src/LoginPage.jsx`:
   a. Add imports: `AlertCircle`, `Loader2` from `lucide-react`; `Input` from `@/components/ui/input`; `Button` from `@/components/ui/button`.
   b. Apply 8 token replacements per §1 table (background, card surface/border, text colours, error block colours).
   c. Replace 2 raw `<input>` elements with `<Input>`.
   d. Replace inline warning SVG with `<AlertCircle size={16} className="text-[var(--danger-ink)] flex-shrink-0 mt-0.5" />`.
   e. Replace raw `<button>` with `<Button type="submit" disabled={busy} className="w-full">…</Button>`.
   f. Replace inline spinner SVG with `<Loader2 size={16} className="animate-spin" />`.
   g. Add `role="alert"` on error block.
2. Verify `npm run build` clean.
3. Verify `npm test -- --run` 235/235.
4. Browser preview empty form, error path, loading path.
5. Commit + push + PR.

---

## 6. Notes for follow-up subplan

This is the last Family B page. After 6A10 merges, the **final cleanup subplan** can:

- Delete `.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` definitions from `src/index.css` if all callers have been swept. Current grep (2026-04-27) shows continued use in `src/components/clients/**` (ProfileTab, CreateClientSlideOut, PhotoGalleryTab, VideoGalleryTab, ArchiveConfirmDialog, CreateClientCloseConfirm) and similar in tasks/teams. **`.btn-*` cleanup must wait until those detail-tab + slide-out sweeps land** — so it isn't a one-step chase after 6A10.
- A more pragmatic next-step is the deferred **detail-tab + modal DS-token sweep** (Staff modals: `ChangePasswordModal`, `DeleteRequestModal`, `ApprovalReviewModal`, etc.; plus `ProfileTab` / `AttributesTab` / `PermissionsTab` / `ActivityTab` content), which still carry slate/indigo classes. That sweep + `.btn-*` removal can be one subplan or split.
