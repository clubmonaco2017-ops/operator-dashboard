# Mobile Rebuild — Sub-A: Bottom-Sheet Drawer Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Create-flow blocker on mobile by introducing `<ResponsiveSlideOut>` wrapper (vaul Drawer на mobile / shadcn Sheet right на desktop) and refactoring 4 Create-форм (Teams, Clients, Tasks, Staff) на этот wrapper.

**Architecture:** Single new component `src/components/ui/responsive-slide-out.jsx` choses Drawer (mobile) или Sheet right (desktop) через `useIsMobile`. Принимает `open`, `onOpenChange`, `title`, `desktopWidth`, `footer`, `onKeyDown`, `children`. Каждая Create-форма передаёт fields через `children` (внутри `<form id="...">`), submit-кнопку через `footer` slot с `form="..."` атрибутом для linkage. Это сохраняет browser-native form submit on Enter и Cmd+Enter через wrapper `onKeyDown`.

**Tech Stack:** React 19 + Vite + Vitest + React Testing Library + Tailwind v4 + shadcn/ui (Sheet, Drawer, Button) + vaul (already installed) + react-router-dom.

**Reference patterns (read before coding):**
- `src/components/ui/sheet.jsx` — existing Sheet primitive (Base UI)
- `src/components/ui/drawer.jsx` — existing Drawer primitive (vaul)
- `src/hooks/use-mobile.js` — `useIsMobile` (768px breakpoint)
- `src/components/teams/CreateTeamSlideOut.jsx` — текущий pattern (Sheet wrapper + form inside)

**Spec:** [`docs/superpowers/specs/2026-05-02-mobile-rebuild-sub-a-bottom-sheet-drawer-design.md`](../specs/2026-05-02-mobile-rebuild-sub-a-bottom-sheet-drawer-design.md)

**Branching:** Feature branch `feat/mobile-sub-a-drawer` off main. Worktree at `.claude/worktrees/feat-mobile-sub-a-drawer`.

---

## File Structure

**Created (2 files):**
- `src/components/ui/responsive-slide-out.jsx` (~80 LOC)
- `src/components/ui/responsive-slide-out.test.jsx` (~110 LOC, 4 it-blocks)

**Modified (4 files):**
- `src/components/teams/CreateTeamSlideOut.jsx`
- `src/components/clients/CreateClientSlideOut.jsx`
- `src/components/tasks/CreateTaskSlideOut.jsx`
- `src/components/staff/CreateStaffSlideOut.jsx`

**Deleted:** ничего.

---

## Task 0: Pre-flight & worktree

**Files:** none (read-only checks + branch setup)

- [ ] **Step 1: Verify clean main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git status
git log --oneline -3
```

Expected: clean working tree.

- [ ] **Step 2: Create worktree + feature branch**

```bash
git worktree add .claude/worktrees/feat-mobile-sub-a-drawer -b feat/mobile-sub-a-drawer
cd .claude/worktrees/feat-mobile-sub-a-drawer
cp /Users/artemsaskin/Work/operator-dashboard/.env.local .env.local
cp -r /Users/artemsaskin/Work/operator-dashboard/.vercel .vercel 2>/dev/null
rm -rf .vercel/output 2>/dev/null
npm ci
```

Expected: worktree ready, deps installed.

- [ ] **Step 3: Pre-flight grep — verify Sheet usage in 4 target forms**

```bash
grep -n 'side={isMobile' src/components/{teams,clients,tasks,staff}/Create*.jsx
```

Expected: 4 matches (one per form), each `side={isMobile ? 'bottom' : 'right'}`.

- [ ] **Step 4: Pre-flight grep — verify no other consumers**

```bash
grep -rn 'side={isMobile' src/ --include="*.jsx"
```

Expected: только 4 файла из Step 3. Если ещё кто-то использует — out of scope для этого subplan'а, не трогаем.

- [ ] **Step 5: Pre-flight grep — `data-slot="sheet-content"` references**

```bash
grep -rn 'data-slot=.sheet-content' src/ --include="*.jsx"
```

Expected: только в `src/components/ui/sheet.jsx` (definition) + возможно тесты. Если в test-файлах для 4-х refactored форм — заметить, обновим если потребуется.

- [ ] **Step 6: Baseline tests + build**

```bash
npm run test:run
npm run build
```

Expected baseline: 19 pre-existing failures (LoginPage 10 + UserMenuDropdown 4 + CreateStaffSlideOut 3 + AgencyFilterDropdown 1 + defaultPermissions 1) + 5 file-level crashes. После refactor — те же. Build clean.

---

## Task 1: `<ResponsiveSlideOut>` wrapper — TDD

**Files:**
- Create: `src/components/ui/responsive-slide-out.jsx`
- Create: `src/components/ui/responsive-slide-out.test.jsx`

- [ ] **Step 1: Write failing test** — create `src/components/ui/responsive-slide-out.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}))

import { ResponsiveSlideOut } from './responsive-slide-out.jsx'
import { useIsMobile } from '@/hooks/use-mobile'

beforeEach(() => {
  useIsMobile.mockReset()
})

describe('ResponsiveSlideOut', () => {
  it('renders title + content + footer', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <ResponsiveSlideOut
        open
        onOpenChange={() => {}}
        title="Test Title"
        footer={<button>Footer Button</button>}
      >
        <div>Form Content</div>
      </ResponsiveSlideOut>,
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Form Content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Footer Button' })).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when user presses Esc', () => {
    useIsMobile.mockReturnValue(false)
    const onOpenChange = vi.fn()
    render(
      <ResponsiveSlideOut open onOpenChange={onOpenChange} title="X">
        <div>content</div>
      </ResponsiveSlideOut>,
    )
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('forwards onKeyDown to root content', () => {
    useIsMobile.mockReturnValue(false)
    const onKeyDown = vi.fn()
    render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="X" onKeyDown={onKeyDown}>
        <input data-testid="input" />
      </ResponsiveSlideOut>,
    )
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter', metaKey: true })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('renders Drawer on mobile and Sheet on desktop', () => {
    // Mobile branch
    useIsMobile.mockReturnValue(true)
    const { unmount } = render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="Mobile">
        <div>m</div>
      </ResponsiveSlideOut>,
    )
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    unmount()

    // Desktop branch
    useIsMobile.mockReturnValue(false)
    render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="Desktop">
        <div>d</div>
      </ResponsiveSlideOut>,
    )
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect 4 failed (Cannot find module)**

```bash
npm run test:run -- src/components/ui/responsive-slide-out.test.jsx
```

- [ ] **Step 3: Implement `responsive-slide-out.jsx`** with this exact content:

```jsx
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

/**
 * Responsive slide-out shell.
 *
 * - Mobile (`useIsMobile()` true): vaul Drawer with default behaviour:
 *   drag handle, max-h-80vh, swipe-down dismiss, internal scroll.
 * - Desktop: shadcn Sheet right side, configurable width.
 *
 * Props:
 * - `open`, `onOpenChange` — controlled open state.
 * - `title` — header text (string or ReactNode).
 * - `desktopWidth` — Tailwind class for desktop width (default `sm:max-w-md`).
 * - `footer` — ReactNode rendered in footer (e.g. submit/cancel buttons).
 * - `onKeyDown` — forwarded to content root (for Cmd+Enter handlers).
 * - `children` — form fields / body. Wrap in `<form id="...">` + use
 *   `<button form="..." type="submit">` in footer to preserve native submit.
 */
export function ResponsiveSlideOut({
  open,
  onOpenChange,
  title,
  desktopWidth = 'sm:max-w-md',
  footer,
  onKeyDown,
  children,
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent onKeyDown={onKeyDown}>
          <DrawerHeader className="border-b border-border px-6 py-4 text-left">
            <DrawerTitle className="text-lg font-bold text-foreground">
              {title}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          {footer && (
            <DrawerFooter className="border-t border-border px-6 py-4">
              {footer}
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onKeyDown={onKeyDown}
        className={cn('flex w-full flex-col gap-0', desktopWidth)}
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-lg font-bold text-foreground">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <SheetFooter className="border-t border-border px-6 py-4">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run tests — expect 4 passed**

```bash
npm run test:run -- src/components/ui/responsive-slide-out.test.jsx
```

If `forwards onKeyDown` fails (vaul или Base UI не пробрасывает) — добавить fallback: повесить onKeyDown через ref/useEffect либо добавить `<div onKeyDown={onKeyDown}>` обёртку вокруг content.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/responsive-slide-out.jsx src/components/ui/responsive-slide-out.test.jsx
git commit -m "feat(ui): add ResponsiveSlideOut wrapper (Sheet desktop / Drawer mobile)"
```

---

## Task 2: Refactor `CreateTeamSlideOut`

**Files:**
- Modify: `src/components/teams/CreateTeamSlideOut.jsx`

Refactor pattern: replace `<Sheet>` outer + form-wrapping with `<ResponsiveSlideOut>` + form inside children + submit button in footer with `form="..."` attribute.

- [ ] **Step 1: Read current file**

```bash
sed -n '1,50p' src/components/teams/CreateTeamSlideOut.jsx
sed -n '140,265p' src/components/teams/CreateTeamSlideOut.jsx
```

Note current structure: `<Sheet>` → `<SheetContent>` → `<SheetHeader>` → `<form>` → `<div className="overflow-auto">{fields}</div>` → `<SheetFooter>{error+buttons}</SheetFooter>`.

- [ ] **Step 2: Update imports**

В `src/components/teams/CreateTeamSlideOut.jsx`:

Удалить:
```jsx
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
```

Добавить:
```jsx
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
```

Также удалить `const isMobile = useIsMobile()` строку из тела компонента (если `useIsMobile` нигде больше не используется — а в этом файле не используется).

- [ ] **Step 3: Replace render block**

Найти render-блок (примерно строки 144-262, начиная с `return (` и заканчивая `</Sheet>` + `)`). Заменить на:

```jsx
  return (
    <ResponsiveSlideOut
      open
      onOpenChange={(next) => !next && !submitting && onClose()}
      title={
        <>
          Новая команда
          <p className="mt-1 text-xs font-normal text-muted-foreground">
            Поля со звёздочкой обязательны
          </p>
        </>
      }
      desktopWidth="sm:max-w-[440px]"
      footer={
        <>
          {submitError && (
            <p
              className="mb-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
              role="alert"
            >
              {submitError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--fg4)]">
              <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono text-[10px]">
                Esc
              </kbd>{' '}
              закрыть ·{' '}
              <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono text-[10px]">
                ⌘↵
              </kbd>{' '}
              создать
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              form="create-team-form"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Создаётся…
                </>
              ) : (
                <><Check size={14} className="inline mr-1.5" />Создать команду</>
              )}
            </Button>
          </div>
        </>
      }
    >
      <form
        id="create-team-form"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
        className="space-y-5"
      >
        <Field
          label="Название команды"
          required
          error={errors.name}
          hint="Например, «Команда Альфа»"
        >
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setNameField(e.target.value)}
            disabled={submitting}
            placeholder="Команда Альфа"
            maxLength={120}
            className={inputCls(!!errors.name)}
          />
        </Field>

        <AgencySelect value={agencyId} onChange={setAgencyId} disabled={submitting} />
        {errors.agencyId && (
          <span className="-mt-3 block text-xs text-[var(--danger-ink)]" role="alert">
            {errors.agencyId}
          </span>
        )}

        <Field
          label="Лид команды"
          required
          error={errors.leadUserId}
          hint={leadsLoading ? 'Загружаем кандидатов…' : 'Тимлид, модератор или админ из выбранного агентства'}
        >
          <select
            value={leadUserId}
            onChange={(e) => setLeadField(e.target.value)}
            disabled={submitting || leadsLoading}
            className={selectCls(!!errors.leadUserId)}
          >
            <option value="">
              {leadsLoading ? 'Загрузка…' : 'Выберите лида…'}
            </option>
            {filteredLeads.map((u) => (
              <option key={u.id} value={u.id}>
                {leadLabel(u)} — {formatLeadRole(u.role) || u.role}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </ResponsiveSlideOut>
  )
```

⚠ Note: form ID `create-team-form` linkает submit-кнопку к form через HTML5 `form` attribute. Browser sends submit event на form → form's onSubmit → handleSubmit. Enter в input field также триggers form's onSubmit (browser default). Cmd+Enter — handled via wrapper's onKeyDown if present (для CreateTeamSlideOut уже есть onKeyDown через global keydown listener в файле — проверить и пробросить если нужно).

Если в файле есть useEffect с document keydown listener для Cmd+Enter — оставить как есть; вместо него можно пробросить `onKeyDown` prop на ResponsiveSlideOut. Проверить текущий файл.

- [ ] **Step 4: Run existing CreateTeamSlideOut tests**

```bash
npm run test:run -- src/components/teams/
```

Expected: все team тесты passing (если они существуют для CreateTeamSlideOut — проверить). Если test использует `data-slot="sheet-content"` — заменить на content-based query (например, `screen.getByRole('dialog')` или `screen.getByText('Новая команда')`).

- [ ] **Step 5: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/teams/CreateTeamSlideOut.jsx
git commit -m "refactor(teams): CreateTeamSlideOut → ResponsiveSlideOut wrapper"
```

---

## Task 3: Refactor `CreateClientSlideOut`

**Files:**
- Modify: `src/components/clients/CreateClientSlideOut.jsx`

- [ ] **Step 1: Read current file structure**

```bash
sed -n '1,30p' src/components/clients/CreateClientSlideOut.jsx
sed -n '200,395p' src/components/clients/CreateClientSlideOut.jsx
```

Note: current structure same shape (Sheet → SheetContent → SheetHeader → form → fields → SheetFooter → buttons).

- [ ] **Step 2: Update imports**

В `src/components/clients/CreateClientSlideOut.jsx`:

Удалить:
```jsx
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
```

Добавить:
```jsx
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
```

Удалить `const isMobile = useIsMobile()` если он только для Sheet (если используется ещё где-то — оставить).

- [ ] **Step 3: Replace render block**

В render-блоке (около строки 204):

Заменить:
```jsx
<Sheet open onOpenChange={(next) => !next && attemptClose()}>
  <SheetContent
    side={isMobile ? 'bottom' : 'right'}
    className={`flex w-full flex-col gap-0 sm:max-w-md${isMobile ? ' h-[90vh]' : ''}`}
  >
    <SheetHeader className="border-b border-border px-6 py-5">
      <SheetTitle className="text-lg font-bold text-foreground">
        ...
      </SheetTitle>
    </SheetHeader>
    <form
      onSubmit={...}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* fields */}
      </div>
      <SheetFooter className="...">
        {/* error + buttons */}
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>
```

На:
```jsx
<ResponsiveSlideOut
  open
  onOpenChange={(next) => !next && attemptClose()}
  title={/* same title node */}
  desktopWidth="sm:max-w-md"
  footer={
    <>
      {/* same submitError + buttons block; submit button: type="submit" form="create-client-form" */}
    </>
  }
>
  <form
    id="create-client-form"
    onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
    className="space-y-5"
  >
    {/* same fields */}
  </form>
</ResponsiveSlideOut>
```

Detailed changes:
- Form ID: `create-client-form`.
- Submit button (`<Button type="submit" ...>`) gets `form="create-client-form"`.
- Cancel button (если type был "button") — без изменений.
- Title и footer content переносятся как props verbatim (с тем же набором элементов).
- Удаляется внешний overflow-hidden flex container — wrapper handles it.

⚠ Important: keep all existing form logic (validation, error states, submit handler, refs, autoFocus) verbatim. Только обернуть в ResponsiveSlideOut.

- [ ] **Step 4: Run existing CreateClient tests**

```bash
npm run test:run -- src/components/clients/
```

Expected: passing если есть тесты, либо без новых regress'ов.

- [ ] **Step 5: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/CreateClientSlideOut.jsx
git commit -m "refactor(clients): CreateClientSlideOut → ResponsiveSlideOut wrapper"
```

---

## Task 4: Refactor `CreateTaskSlideOut`

**Files:**
- Modify: `src/components/tasks/CreateTaskSlideOut.jsx`

- [ ] **Step 1: Read current file structure**

```bash
sed -n '1,30p' src/components/tasks/CreateTaskSlideOut.jsx
sed -n '125,260p' src/components/tasks/CreateTaskSlideOut.jsx
```

- [ ] **Step 2: Update imports**

В `src/components/tasks/CreateTaskSlideOut.jsx`:

Удалить:
```jsx
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
```

Добавить:
```jsx
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
```

Удалить `const isMobile = useIsMobile()` если только для Sheet.

- [ ] **Step 3: Replace render block**

В render-блоке (около строки 129):

Заменить `<Sheet>` + `<SheetContent>` + `<SheetHeader>` + `<form>` + `<SheetFooter>` структуру на `<ResponsiveSlideOut>` с form внутри children и footer как prop.

- Form ID: `create-task-form`.
- Submit button: `<Button type="submit" form="create-task-form" ...>`.
- Title: same content (e.g. «Новая задача»), as title prop.
- desktopWidth: `sm:max-w-md`.
- Footer: same submitError + Cancel + Submit buttons block.
- onOpenChange: `(next) => !next && attemptClose()`.

Verbatim preservation: validation, fields (name, description, due date, assignee, etc.), error display, refs, autoFocus.

- [ ] **Step 4: Run existing CreateTask tests**

```bash
npm run test:run -- src/components/tasks/
```

Expected: passing.

- [ ] **Step 5: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/tasks/CreateTaskSlideOut.jsx
git commit -m "refactor(tasks): CreateTaskSlideOut → ResponsiveSlideOut wrapper"
```

---

## Task 5: Refactor `CreateStaffSlideOut`

**Files:**
- Modify: `src/components/staff/CreateStaffSlideOut.jsx`

⚠ This is the largest form — много полей, permissions block, agencies multi-chips. **Имеет 3 baseline failures** в тестах (НЕ связаны с Sheet — mock data fetch issues). После refactor — те же 3 failures должны остаться.

- [ ] **Step 1: Read current file structure**

```bash
sed -n '1,30p' src/components/staff/CreateStaffSlideOut.jsx
sed -n '120,320p' src/components/staff/CreateStaffSlideOut.jsx
```

- [ ] **Step 2: Update imports**

В `src/components/staff/CreateStaffSlideOut.jsx`:

Удалить:
```jsx
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
```

Добавить:
```jsx
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
```

⚠ Проверить: `useIsMobile` могла использоваться где-то ещё в файле (например, для conditional permissions UI). Если используется — оставить импорт.

- [ ] **Step 3: Replace render block**

В render-блоке (около строки 123):

Заменить структуру на `<ResponsiveSlideOut>` с form внутри.

- Form ID: `create-staff-form`.
- Submit button: `<Button type="submit" form="create-staff-form" ...>`.
- Title: same, as prop.
- desktopWidth: `sm:max-w-lg` (форма самая большая, нужно больше места на desktop).
- Footer: same submitError + buttons block.

Verbatim preservation: ВСЕ permissions, multi-agency chips, defaultPermissions logic, refs, autoFocus.

- [ ] **Step 4: Run existing CreateStaffSlideOut tests**

```bash
npm run test:run -- src/components/staff/CreateStaffSlideOut.test.jsx 2>&1 | tail -10
```

Expected: 3 baseline failures (calls onCreated с refCode, admin multi-select multi-agency, p_admin_agency_ids). Никаких **новых** failures.

Если появилось 4+ failures — значит refactor что-то сломал. Откатиться, разобраться.

Если test использует Sheet-specific selector (`data-slot="sheet-content"`) — обновить на content-based.

- [ ] **Step 5: Run full suite**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests" | head -3
```

Expected: те же 19 failures, ~334+ passes (4 wrapper tests + previous baseline).

- [ ] **Step 6: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/staff/CreateStaffSlideOut.jsx
git commit -m "refactor(staff): CreateStaffSlideOut → ResponsiveSlideOut wrapper"
```

---

## Task 6: Manual smoke test (preview deploy)

**Files:** none (runtime check)

- [ ] **Step 1: Deploy preview**

```bash
vercel
```

Expected: preview URL.

- [ ] **Step 2: Mobile sanity (DevTools 375×667 iPhone SE)**

Login as admin/superadmin. Test each form:

- [ ] (a) `/teams + Новая` → Drawer открывается снизу, видно handle сверху; swipe-down → закрывается.
- [ ] (b) `/clients + Новый` → то же.
- [ ] (c) `/tasks + Новая` → то же.
- [ ] (d) `/staff + Новый` → длинная форма scrolls внутри drawer (max-h-80vh).
- [ ] (e) Esc или backdrop tap → закрывается.
- [ ] (f) Cmd+Enter (Bluetooth keyboard sim в DevTools) → submit.

- [ ] **Step 3: Desktop sanity (DevTools 1280px)**

- [ ] (g) `/teams + Новая` → Sheet справа (как было), Esc/backdrop/X закрывают.
- [ ] (h) Cmd+Enter → submit.
- [ ] (i) Все 4 формы submit'ятся успешно через клик кнопки.

- [ ] **Step 4: Regression**

- [ ] (j) `/admin/agencies + Новое` и `/admin/platforms + Новое` — Sheet right работает (НЕ изменены).
- [ ] (k) Other Dialogs (`ArchiveAgencyDialog`, `DeletePlatformDialog`, `ArchiveTeamConfirmDialog`) не затронуты.

- [ ] **Step 5: Записать результаты**

Если регресс — починить (additional commit). Если всё ОК — Task 7.

---

## Task 7: Final validation + memory update + PR + merge + deploy

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_mobile_status.md` (memory вне репо)

- [ ] **Step 1: Final test/build/lint**

```bash
npm run test:run
npm run build
npm run lint
```

Expected:
- Tests: те же 19 pre-existing failures + 4 wrapper passes (~335+ passes total).
- Build: clean.
- Lint: baseline (~70 problems), без новых ошибок от refactored файлов.

- [ ] **Step 2: Update memory `project_mobile_status.md`**

Найти секцию «Что ещё пендингует для mobile» item 6 (`CreateStaff / CreateClient / CreateTask bottom-sheet defect`). Заменить на:

```
6. ~~**CreateStaff / CreateClient / CreateTask / CreateTeam bottom-sheet defect**~~ — DONE (Sub-A, PR #<TBD>). 4 Create-форм рефакторены на новый `<ResponsiveSlideOut>` wrapper в `src/components/ui/`. На mobile рендерит vaul Drawer (drag-to-dismiss + handle + max-h-80vh + internal scroll); на desktop — Sheet right side (как было). Snap-points отложены, default vaul behaviour достаточен.
```

- [ ] **Step 3: Verify clean state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, ~6 коммитов на ветке (1 wrapper + 4 refactor + 0-1 fix если был).

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/mobile-sub-a-drawer
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(mobile): Sub-A — bottom-sheet drawer fix (vaul Drawer wrapper)" --body "$(cat <<'EOF'
## Summary
Fix Create-flow blocker on mobile: `<Sheet side=\"bottom\">` с `h-[90vh]` overflow → vaul Drawer с drag-to-dismiss + handle + internal scroll.

- New `<ResponsiveSlideOut>` wrapper в `src/components/ui/responsive-slide-out.jsx` — выбирает Drawer (mobile) / Sheet right (desktop) через `useIsMobile`.
- 4 Create-форм refactored на wrapper: Teams, Clients, Tasks, Staff.
- Каждая форма использует `<form id=\"create-X-form\">` + `<Button form=\"...\" type=\"submit\">` для linkage button↔form (preserves Enter-to-submit и Cmd+Enter).
- Admin Create-форм (`CreateAgencySlideOut`, `CreatePlatformSlideOut`) **не затронуты** — desktop-only superadmin use.

Spec: \`docs/superpowers/specs/2026-05-02-mobile-rebuild-sub-a-bottom-sheet-drawer-design.md\`
Plan: \`docs/superpowers/plans/2026-05-02-mobile-rebuild-sub-a-bottom-sheet-drawer.md\`

## Test plan
- [x] Mobile (375×667): drawer opens from bottom, handle visible, swipe-down closes, internal scroll works в длинной CreateStaff форме.
- [x] Esc / backdrop / X закрывают.
- [x] Cmd+Enter submit'ит форму.
- [x] Desktop (1280px): Sheet right side как было, без визуальных регрессий.
- [x] Admin Create-формы (Agencies/Platforms) — без изменений.
- [x] Other Dialogs (Archive/Delete) не затронуты.
- [x] npm run test:run: 4 новых wrapper passes; 19 pre-existing failures без изменений.
- [x] Build clean; lint baseline.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Update memory с PR номером**

После `gh pr create` — заменить `PR #<TBD>` на реальный номер в memory `project_mobile_status.md`.

- [ ] **Step 7: Switch gh user перед merge**

```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 8: Merge after approval**

```bash
gh pr merge <PR#> --squash --delete-branch
```

⚠ Если merge fails из-за worktree — выполнить из main checkout:
```bash
cd /Users/artemsaskin/Work/operator-dashboard && gh pr merge <PR#> --squash --delete-branch
```

- [ ] **Step 9: Cleanup worktree + sync main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git worktree remove .claude/worktrees/feat-mobile-sub-a-drawer
git branch -D feat/mobile-sub-a-drawer 2>/dev/null || true
git pull --ff-only
```

- [ ] **Step 10: Production deploy**

```bash
vercel --prod
```

Expected: production URL. После deploy — Sub-A complete; mobile Create-flows работают.

---

## Self-review (после написания плана — выполнено перед сдачей)

1. **Spec coverage** — каждый goal из spec'а покрыт задачей:
   - Goal 1 (создать wrapper) — Task 1.
   - Goal 2 (API: open, onOpenChange, title, desktopWidth, footer, onKeyDown, children) — Task 1 implementation.
   - Goal 3 (mobile: Drawer default behaviour) — Task 1.
   - Goal 4 (desktop: Sheet right) — Task 1.
   - Goal 5 (refactor 4 Create-форм) — Tasks 2, 3, 4, 5.
   - Goal 6 (удалить useIsMobile) — Tasks 2-5 Step 2.
   - Goal 7 (no desktop visual regressions) — Tasks 2-5 manual smoke + Task 6.
   - Goal 8 (no test regressions, baseline 19) — Tasks 2-5 verification + Task 7.

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные. PR # — это ожидаемый TBD до `gh pr create`.

3. **Type / naming consistency**:
   - Form IDs: `create-team-form`, `create-client-form`, `create-task-form`, `create-staff-form` — единообразно.
   - Component name `ResponsiveSlideOut` — везде.
   - Import path `@/components/ui/responsive-slide-out` — единообразно.
   - Wrapper props (`open`, `onOpenChange`, `title`, `desktopWidth`, `footer`, `onKeyDown`, `children`) — единообразно в Task 1 и Tasks 2-5 usage.

4. **Out-of-scope чистота**: ни одна задача не трогает admin Create-форм, primitives (sheet.jsx/drawer.jsx), other modals (Dialog), other mobile pages.

5. **Order dependencies**: Task 1 (wrapper) → Tasks 2-5 (parallel: each refactor uses wrapper). Tasks 2-5 могут выполняться в любом порядке (independent files).

6. **Tests are real, not mocked-only**: Wrapper tests verify branching + prop forwarding + Esc handler. Form refactor tasks rely on existing form tests (preserved by verbatim field copy).

7. **Form ID linkage** — explicitly addressed: button с `form="..."` attr submit'ит associated form. Browser support OK (modern only). Preserves Enter-to-submit.
