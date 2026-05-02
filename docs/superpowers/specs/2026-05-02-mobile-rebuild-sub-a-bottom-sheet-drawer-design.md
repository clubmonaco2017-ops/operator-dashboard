# Mobile Rebuild — Sub-A: Bottom-Sheet Drawer Fix Design

**Date:** 2026-05-02
**Status:** Spec — awaiting user review

## Summary

Sub-A из mobile rebuild track. Чинит **блокер** Create-форм на mobile: сейчас 4 формы (Teams/Clients/Tasks/Staff) используют `<Sheet side="bottom">` с `h-[90vh]`, но контент вылезает за viewport на iPhone. Решение — новый `<ResponsiveSlideOut>` wrapper в `src/components/ui/`, который рендерит **vaul Drawer** на mobile (drag-to-dismiss + handle + max-h-80vh + внутренний scroll) и **shadcn Sheet right** на desktop (как было). 4 Create-форм рефакторятся на этот wrapper.

После Sub-A unblocked все mobile Create-flows; следующие sub-projects в track ([Sub-B] /tasks mobile, etc.) получают рабочий baseline для свежих форм-сценариев.

## Goals

1. Создать `<ResponsiveSlideOut>` wrapper в `src/components/ui/responsive-slide-out.jsx` — выбирает Drawer (mobile) / Sheet right (desktop) через `useIsMobile`.
2. Wrapper API: `open`, `onOpenChange`, `title`, `desktopWidth`, `footer`, `onKeyDown`, `children`.
3. На mobile: vaul Drawer с default behaviour — drag handle, max-h-80vh, swipe-down dismiss, body scroll lock встроенный.
4. На desktop: Sheet right с настраиваемым width (`sm:max-w-md` default).
5. Refactor 4 Create-форм на wrapper:
   - `src/components/teams/CreateTeamSlideOut.jsx` (desktopWidth `sm:max-w-[440px]`)
   - `src/components/clients/CreateClientSlideOut.jsx` (default `sm:max-w-md`)
   - `src/components/tasks/CreateTaskSlideOut.jsx` (default `sm:max-w-md`)
   - `src/components/staff/CreateStaffSlideOut.jsx` (`sm:max-w-lg`)
6. Удалить `useIsMobile` импорты из refactored форм (если не используются для других целей).
7. Никаких визуальных регрессий на desktop — Sheet right side как было.
8. Никаких новых регрессий в существующих тестах — baseline 19 failures сохраняется.

## Non-goals

- Snap points для drawer (отложено; default vaul behaviour).
- Refactor `CreateAgencySlideOut` и `CreatePlatformSlideOut` — admin/desktop-only, hard-coded `side="right"`. Out of scope.
- Mobile fixes для других страниц (`/tasks`, `/teams`, etc.) — это Sub-B…E.
- Изменения в shadcn primitives (`sheet.jsx`, `drawer.jsx`) — wrapper использует existing.
- Body scroll lock optimization, kbd shortcut audits — vaul/Sheet handle natively.
- Tables→cards mobile pattern (cross-cutting Sub-E).

## Architecture

### Wrapper component

Single file `src/components/ui/responsive-slide-out.jsx` (~80 LOC):

```jsx
import { useIsMobile } from '@/hooks/use-mobile'
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

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

### Refactor pattern (для каждой Create-формы)

```jsx
// БЫЛО
<Sheet open onOpenChange={(open) => !open && onClose()}>
  <SheetContent side={isMobile ? 'bottom' : 'right'}
    className={`flex w-full flex-col gap-0 sm:max-w-[440px]${isMobile ? ' h-[90vh]' : ''}`}>
    <SheetHeader ...>
      <SheetTitle>Новая команда</SheetTitle>
    </SheetHeader>
    <form onSubmit={submit} onKeyDown={onKeyDown} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {/* fields */}
    </form>
    <SheetFooter ...>
      <Button variant="outline" onClick={onClose}>Отменить</Button>
      <Button onClick={submit}>Создать</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>

// СТАЛО
<ResponsiveSlideOut
  open
  onOpenChange={(open) => !open && onClose()}
  title="Новая команда"
  desktopWidth="sm:max-w-[440px]"
  onKeyDown={onKeyDown}
  footer={
    <>
      <Button variant="outline" onClick={onClose}>Отменить</Button>
      <Button onClick={submit}>Создать</Button>
    </>
  }
>
  <form onSubmit={submit} className="space-y-4">
    {/* fields */}
  </form>
</ResponsiveSlideOut>
```

`useIsMobile` импорт удаляется из формы (если не нужен для других целей).

### File Structure

**Created:**
- `src/components/ui/responsive-slide-out.jsx` (~80 LOC)
- `src/components/ui/responsive-slide-out.test.jsx` (~80 LOC, 4 it-blocks)

**Modified (4 Create-форм):**
- `src/components/teams/CreateTeamSlideOut.jsx`
- `src/components/clients/CreateClientSlideOut.jsx`
- `src/components/tasks/CreateTaskSlideOut.jsx`
- `src/components/staff/CreateStaffSlideOut.jsx`

Каждая теряет ~30 LOC boilerplate (Sheet wrap + branching), приобретает clean ResponsiveSlideOut вызов.

**Deleted:** ничего.

## Test Plan

### Unit (`responsive-slide-out.test.jsx`, 4 it-blocks)

1. **Renders title + content + footer.** Mock `useIsMobile=false`, render с `title="Test"`, `footer={<button>OK</button>}`, content child. Assert title + content + footer visible.
2. **Calls onOpenChange(false) on close.** Mock `useIsMobile=false`, simulate Esc keydown → `onOpenChange` mock called with `false`.
3. **`onKeyDown` пробрасывается.** Pass `onKeyDown={mockHandler}`, simulate Cmd+Enter → handler called.
4. **Mobile vs desktop branch.** Two render passes:
   - `useIsMobile=true` → DOM contains `data-slot="drawer-content"`, не Sheet
   - `useIsMobile=false` → DOM contains `data-slot="sheet-content"`, не Drawer

### Existing form tests

Не изменяются. Ожидаются те же баseline 19 failures (включая 3 в `CreateStaffSlideOut.test.jsx` — не Sheet-связанные, mock data-fetch issues).

Если после refactor конкретный тест ссылается на `data-slot="sheet-content"` или подобный Sheet-specific selector — обновить query на content-based (text/role).

### Manual smoke (preview deploy)

**Mobile (DevTools 375×667 iPhone SE):**
- (a) `/teams + Новая` → Drawer открывается снизу с handle сверху; swipe-down dismisses; внутренний scroll работает
- (b) `/clients + Новый` → то же
- (c) `/tasks + Новая` → то же
- (d) `/staff + Новый` → длинная форма scrolls внутри drawer (max-h-80vh)
- (e) Esc / backdrop tap → закрывается
- (f) Заполнить поле + Cmd+Enter → submit (если есть Bluetooth keyboard sim)

**Desktop (DevTools 1280px):**
- (g) `/teams + Новая` → Sheet справа (как было), Esc/backdrop/X закрывают
- (h) Cmd+Enter → submit

**Regression:**
- (i) `/admin/agencies + Новое` и `/admin/platforms + Новое` — Sheet right работает (НЕ изменены)
- (j) Other Dialogs (ArchiveAgencyDialog, DeletePlatformDialog) — не затронуты
- (k) Other modals/sheets в проекте — не затронуты

### Build / lint / test
- `npm run test:run` — те же 19 pre-existing failures + 4 новых wrapper passes (~354+ total).
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| vaul Drawer не пробрасывает `onKeyDown` на корневой DOM-узел — Cmd+Enter в форме ломается на mobile | Test 3 проверяет `onKeyDown` proxy. Fallback: повесить handler через ref на content-div, либо document keydown listener. |
| vaul конфликтует с body scroll lock от существующих overlays | vaul имеет встроенный body lock. Конфликтов не было — Drawer primitive уже используется в проекте (см. `src/components/ui/drawer.jsx`). |
| `CreateStaffSlideOut.test.jsx` 3 baseline failures меняют статус (становятся другими failures) | Pre-flight check: точные имена 3 failures зафиксированы (calls onCreated с refCode, admin multi-select multi-agency, p_admin_agency_ids). После refactor — те же 3 failures. Если меняются — отдельный investigation, не блокирует. |
| Drawer max-h-80vh недостаточно для длинной CreateStaff формы на iPhone SE (667px) | Внутренний scroll работает — user скроллит. Snap-points отложены. Если реальная жалоба — отдельный follow-up subplan. |
| vaul handle (`bg-muted` 100×4 strip) визуально не вписывается в DS | Default handle уже на DS-токене. Если mismatch — class override через `DrawerContent` className. |
| Existing `data-slot="sheet-content"` references в каком-то общем коде | Pre-flight grep на `sheet-content` selector в `src/`. Если только в test-файлах — обновляем точечно. |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные, не пересекаются.
- [x] Wrapper API минимально и полно покрывает 4 use-case'а.
- [x] Каждая из 4 Create-форм имеет note про `desktopWidth` (current value preserved).
- [x] Tests cover wrapper behavior (4 tests), не form internals.
- [x] Out-of-scope чистота: НЕ трогаем admin Create-форм, primitives, other modals.
- [x] Mobile-only behaviour (drawer) и desktop-only behaviour (sheet) явно разделены.
- [x] Risk про baseline failures зафиксирован.
