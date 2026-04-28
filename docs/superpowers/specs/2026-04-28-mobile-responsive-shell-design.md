# Mobile Responsive Shell — Design Spec

**Status:** Brainstormed · approved · spec ready for user review.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-28.
**Implements:** [docs/superpowers/specs/2026-04-23-crm-system-design.md](2026-04-23-crm-system-design.md) §12 (mobile-first contract) — restoration of the mobile-first contract that regressed during Subplan 6A shell rebuild. Closes the orphan-status of `src/hooks/use-mobile.js` (`useIsMobile` is currently used in 0 files).

**Builds on:**
- [Subplan 6A](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — defined the current desktop three-pane shell (`AppShell` + `RailNav` + `MasterDetailLayout`) which this spec wraps in a mobile branch.
- [Subplan 6D](2026-04-27-crm-subplan-6d-modals-migration-design.md) — gave us `<Sheet>` (Base UI) primitives that we now use on mobile for slide-outs and the navigation drawer.

**Reference pattern:** [shadcnblocks application-shell7](https://www.shadcnblocks.com/preview/application-shell7) — fixed top bar with hamburger, fixed bottom nav, gesture-driven drawer.

**Memory:** [project_mobile_status.md](../../.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_mobile_status.md), [project_next_up_plan.md](../../.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_next_up_plan.md).

---

## 1. Goal & non-goals

**Goal.** Восстановить mobile-first контракт CRM. Ввести branch shell-кода по `useIsMobile()` так, чтобы все master/detail-страницы и большинство стандартных взаимодействий (формы, навигация, оповещения, тема) были usable на ширине от 375px без специальной разводки внутри страниц.

**В scope:**
1. Новый mobile shell — fixed `MobileTopBar` (☰ + section title + 🔔) + scrollable `<Outlet/>` + fixed `MobileBottomNav` (5 role-gated разделов).
2. `MobileNavDrawer` (Base UI Sheet `side="left"`) — профиль, тема, админ-секции (для superadmin), logout.
3. Переключатель в `AppShell.jsx` — на mobile рендерит `MobileShell`, на desktop — текущий 2-колоночный layout с `RailNav`.
4. Branch в `MasterDetailLayout.jsx` — на mobile рендерит ИЛИ list-pane ИЛИ detail (push-навигация), без 2-колоночного grid'а.
5. `useSectionTitle(title, { backTo? })` Context+hook — пробрасывает title и backToHref из page-компонентов в `MobileTopBar`. На detail-роутах TopBar заменяет ☰ на ←.
6. Slide-out sheet'ы (`Create*SlideOut.jsx` файлы) — `side="bottom"` на mobile, `side="right"` на desktop. Высота на mobile — `h-[90vh]`.
7. Touch targets на mobile-only элементах — `min-h-11 min-w-11` (44px Apple HIG минимум).
8. Safe-area insets на TopBar и BottomNav — `pt-[env(safe-area-inset-top)]` / `pb-[env(safe-area-inset-bottom)]`.

**Out of scope (явно отложено в follow-up PR'ы):**
- Per-page mobile polish — отдельные мини-PR'ы для /tasks, /dashboard, /teams (приоритет в этом порядке).
- Tasks: camera-upload оптимизация, photo compression на mobile.
- Dashboard: mobile-specific card prioritization, скрытие неприменимых на узком экране карт.
- Teams detail: горизонтальный сегмент-контрол для табов.
- Staff sub-tabs (profile/attributes/permissions/activity) — тот же сегмент-контрол polish.
- Lightbox swipe-down dismiss enhancement (функционально работает после 6D2).
- Scroll-position restoration при возврате с detail на list.
- Анимированный transition между ☰ и ← в TopBar.
- Theme submenu polish внутри drawer (отдельный sheet?) — текущая реализация: inline items.
- Bottom-sheet quick-switch для list-pane (вариант β из brainstorm'а — push-only выбран для PR'а, β становится кандидатом на отдельный enhancement).
- PWA / installable / offline-mode — никогда не были в scope, остаются вне.
- AdminLayout (`/admin/*` routes) — административные разделы, mobile не приоритет.

---

## 2. File-level diff summary

**Created (10):**
```
src/components/shell/MobileShell.jsx
src/components/shell/MobileTopBar.jsx
src/components/shell/MobileBottomNav.jsx
src/components/shell/MobileNavDrawer.jsx
src/components/shell/MobileShell.test.jsx
src/components/shell/MobileTopBar.test.jsx
src/components/shell/MobileBottomNav.test.jsx
src/components/shell/MobileNavDrawer.test.jsx
src/hooks/useSectionTitle.js
src/hooks/useSectionTitle.test.js
```

**Modified:**
```
src/components/shell/AppShell.jsx                — branch on useIsMobile
src/components/shell/MasterDetailLayout.jsx      — branch + new prop `detailEmpty`
src/components/shell/AppShell.test.jsx           — добавить mobile branch
src/components/shell/MasterDetailLayout.test.jsx — добавить mobile branch
src/components/shell/index.js                    — экспортировать новые компоненты
src/pages/TaskListPage.jsx                       — useSectionTitle + detailEmpty prop
src/pages/ClientListPage.jsx                     — useSectionTitle + detailEmpty prop
src/pages/TeamListPage.jsx                       — useSectionTitle + detailEmpty prop
src/pages/StaffListPage.jsx                      — useSectionTitle + detailEmpty prop
src/pages/DashboardPage.jsx                      — useSectionTitle('Дашборд')
src/pages/NotificationsPage.jsx                  — useSectionTitle('Оповещения')
src/components/tasks/TaskDetailPanel.jsx         — useSectionTitle(title, { backTo })
src/components/clients/ClientDetailPanel.jsx     — useSectionTitle(title, { backTo })
src/components/teams/TeamDetailPanel.jsx         — useSectionTitle(title, { backTo })
src/components/staff/StaffDetailPanel.jsx        — useSectionTitle(title, { backTo })
src/components/tasks/CreateTaskSlideOut.jsx      — Sheet side via useIsMobile
src/components/clients/CreateClientSlideOut.jsx  — Sheet side via useIsMobile
src/components/teams/CreateTeamSlideOut.jsx      — Sheet side via useIsMobile
src/components/staff/CreateStaffSlideOut.jsx     — Sheet side via useIsMobile
```

**Deleted:** none. Existing desktop components (`RailNav`, `ListPane`, `SearchInput`, `ThemeToggle`, `UserMenuDropdown`) stay as desktop-only — they continue to be referenced from desktop branches.

**Estimated PR size:** ~1200–1500 LOC inserted (≈600 implementation + ≈600 tests + ≈100 modifications).

---

## 3. Architecture

### 3.1 Branch points

Только два места содержат `useIsMobile()`:

1. `AppShell.jsx` — root composition.
2. `MasterDetailLayout.jsx` — list/detail render swap.

Plus thin wrappers в slide-out компонентах для `Sheet` `side` prop, и в новых mobile components используется `useIsMobile()` опосредованно через render path (они вообще не рендерятся при `isMobile=false`).

Pages **не знают** про mobile — они продолжают вызывать `<MasterDetailLayout listPane={...} detailEmpty={!param}>`.

### 3.2 Mobile shell tree

```
<MobileShell>                             // grid-rows-[48px_1fr_56px] h-screen
  <SectionTitleProvider>                  // Context wrapper
    <MobileTopBar>                        // 48px + safe-area-inset-top
      ☰ или ← (по backTo) + title + 🔔(badge, only superadmin)
    </MobileTopBar>
    <MobileNavDrawer ... />               // Base UI Sheet side="left", controlled
    <main className="overflow-auto pb-[env(safe-area-inset-bottom)]">
      <Outlet />                          // page content
    </main>
    <MobileBottomNav>                     // 56px + safe-area-inset-bottom
      Дашборд / Сотр. / Клиенты / Команды / Задачи (role-gated)
    </MobileBottomNav>
  </SectionTitleProvider>
</MobileShell>
```

`MobileShell` владеет state'ом `drawerOpen` и закрывает drawer при изменении `useLocation().pathname`.

### 3.3 `useSectionTitle` API

```js
// src/hooks/useSectionTitle.js
import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext({ title: '', backTo: null, setTitle: () => {}, setBackTo: () => {} })

export function SectionTitleProvider({ children }) {
  const [title, setTitle] = useState('')
  const [backTo, setBackTo] = useState(null)
  return <Ctx.Provider value={{ title, backTo, setTitle, setBackTo }}>{children}</Ctx.Provider>
}

export function useSectionTitle(title, options = {}) {
  const { setTitle, setBackTo } = useContext(Ctx)
  const { backTo = null } = options
  useEffect(() => {
    setTitle(title)
    setBackTo(backTo)
    return () => {
      setTitle('')
      setBackTo(null)
    }
  }, [title, backTo, setTitle, setBackTo])
}

export function useSectionTitleValue() {
  const { title, backTo } = useContext(Ctx)
  return { title, backTo }
}
```

Pages вызывают `useSectionTitle('Задачи')` (list) или `useSectionTitle(client.name, { backTo: '/clients' })` (detail). При unmount контекст очищается — следующий route проставит свой.

`MobileTopBar` читает через `useSectionTitleValue()` и:
- Если `backTo` truthy → рендерит `<Button onClick={() => navigate(backTo)}>←</Button>`.
- Иначе → `<Button onClick={openDrawer}>☰</Button>`.
- Если `title` пустой → fallback на `routeToTitle[location.pathname]` (карта `'/' → 'Дашборд'`, `/notifications → 'Оповещения'`, etc.).

### 3.4 `MasterDetailLayout` mobile branch

```jsx
import { useIsMobile } from '@/hooks/use-mobile'

export function MasterDetailLayout({ listPane, listLabel, detailLabel, detailEmpty, children }) {
  const isMobile = useIsMobile()
  if (isMobile) {
    if (detailEmpty) {
      return <aside aria-label={listLabel} className="h-full overflow-y-auto">{listPane}</aside>
    }
    return <section aria-label={detailLabel} className="h-full overflow-y-auto">{children}</section>
  }
  // desktop — текущая 2-колоночная сетка
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside aria-label={listLabel} className="border-r border-border bg-card overflow-y-auto">{listPane}</aside>
      <section aria-label={detailLabel} className="overflow-y-auto">{children}</section>
    </div>
  )
}
```

`detailEmpty` — boolean prop, передаваемый страницей. Page вычисляет через `useParams()` (потому что param-name у каждой страницы свой):

```jsx
// TaskListPage.jsx
import { useParams } from 'react-router-dom'

export function TaskListPage() {
  const { taskId } = useParams()
  useSectionTitle('Задачи')
  return (
    <MasterDetailLayout
      listPane={<ListPane title="Задачи" search={...}>...</ListPane>}
      detailEmpty={!taskId}
      listLabel="Список задач"
      detailLabel="Детали задачи"
    >
      <Outlet />
    </MasterDetailLayout>
  )
}
```

### 3.5 Bottom-nav permission map

| Item        | Permission check                                                               |
|-------------|--------------------------------------------------------------------------------|
| Дашборд     | always                                                                         |
| Сотрудники  | `hasPermission(user, 'create_users')`                                          |
| Клиенты     | `hasPermission(user, 'manage_clients')`                                        |
| Команды     | `canSeeTeamsNav(user, hasTeamMembership)`                                      |
| Задачи      | `hasPermission(user, 'view_own_tasks') \|\| hasPermission(user, 'view_all_tasks')` |

(Те же проверки что в `RailNav.jsx`, без оповещений — они в TopBar).

### 3.6 Slide-out responsive

```jsx
// CreateTaskSlideOut.jsx (and the 3 sibling files)
const isMobile = useIsMobile()
return (
  <Sheet open={open} onOpenChange={onClose}>
    <SheetContent
      side={isMobile ? 'bottom' : 'right'}
      className={isMobile ? 'h-[90vh]' : 'w-[480px]'}
    >
      ...existing form...
    </SheetContent>
  </Sheet>
)
```

`overflow-y-auto` на body уже есть после 6D — не меняем.

### 3.7 Что НЕ меняется

- `useAuth.jsx`, `permissions.js`, `useUserOverdueCount`, `usePendingDeletionCount` — переиспользуем как есть.
- `RailNav.jsx`, `ListPane.jsx`, `SearchInput.jsx`, `ThemeToggle.jsx`, `UserMenuDropdown.jsx` — desktop-only, без правок.
- Routing (`App.jsx`) — без изменений. `<Route element={<AppShell/>}>` остаётся, AppShell сам решает что рендерить.
- DS tokens, `src/index.css` — не трогаем.

---

## 4. Pre-condition verification (must be true before starting)

```bash
# 1. useIsMobile orphan status (текущий baseline)
grep -rn "useIsMobile" src --include='*.jsx' --include='*.js' | grep -v 'use-mobile.js'
# Expected: empty (orphaned). После PR должно быть ≥2 use sites.

# 2. Все 4 SlideOut'а действительно используют Sheet (после 6D)
grep -l "from '@/components/ui/sheet'" src/components/{tasks,clients,teams,staff}/*SlideOut.jsx
# Expected: 4 files listed.

# 3. Tests baseline
npm test -- --run
# Expected: 235/235 green.

# 4. Build baseline
npm run build
# Expected: clean.
```

Если что-то из этого не выполняется — стоп, разобраться, не править вслепую.

---

## 5. Acceptance criteria

**Build & tests:**
- `npm run build` clean, no warnings.
- `npm test -- --run` ≥ 235 + N tests (где N = новые тесты, минимум +25 cases по 7 новым test-файлам).
- Все новые тесты проходят, старые не сломались.

**Functional (manual via DevTools device emulation):**
- На 375×667 (iPhone SE):
  - На каждом разделе (Дашборд / Сотрудники / Клиенты / Команды / Задачи / Оповещения) — TopBar показывает корректный title.
  - Bottom-nav показывает только разделы по permission'ам пользователя; active state корректен.
  - Гамбургер открывает drawer; backdrop tap / Esc / swipe-left закрывают.
  - Drawer закрывается автоматически при route change.
  - Theme switch внутри drawer работает.
  - Logout работает.
  - Тап на task/client/team/staff в списке → push на detail; TopBar показывает ←; тап ← → возврат на list.
  - 🔔 badge виден у superadmin'а; тап → /notifications.
  - Create-формы (Task/Client/Team/Staff) открываются как bottom-sheet `h-[90vh]` со скроллом.
- На 414×896 (iPhone 11 Pro Max) — то же.
- На 768×1024 (iPad portrait) — переключился на desktop layout (`RailNav` + 2-колоночный `MasterDetailLayout`).
- iOS Safari safe-area: на устройстве с notch'ом TopBar и BottomNav корректно отбиваются от системных областей.

**Code quality:**
- `useIsMobile` хук теперь используется ≥ 2 файлов (orphan status снят).
- Никаких новых ESLint warning'ов.
- Все новые компоненты следуют конвенциям 6A — `data-slot` selectors в тестах, `import { ... } from '@/...'` aliases.

**Memory updates (post-merge):**
- `project_mobile_status.md` — статус «mobile shell shipped, per-page polish queued».
- `project_next_up_plan.md` — пометить mobile shell как DONE, выставить per-page polish PR'ы как next-up.

---

## 6. Risk register

| Риск | Вероятность | Митигация |
|---|---|---|
| Detail-страница забыла вызвать `useSectionTitle` → пустой TopBar title | Средняя | Fallback в `MobileTopBar`: `routeToTitle` карта по `useLocation().pathname`. Конкретно для detail — fallback на parent's title (`/tasks/:id` → 'Задачи'). |
| `useIsMobile` flicker на initial mount (`undefined` → `false` → `true`) | Низкая | Hook возвращает `!!isMobile` (boolean), `undefined` приводится к `false` → desktop layout как safe initial render; одна перерисовка после первого `useEffect`. |
| Sheet `side="bottom"` ломает форму с длинным контентом | Средняя | `h-[90vh]` + `overflow-y-auto` на body (уже есть после 6D). Manual check каждой Create*-формы в acceptance criteria. |
| Drawer не закрывается при route change | Высокая (легко забыть) | `useEffect(() => setDrawerOpen(false), [location.pathname])` в `MobileShell`. Тест на это в `MobileShell.test.jsx`. |
| Bottom-nav перекрывает последний item списка | Высокая | На mobile `<main>` внутри `MobileShell` имеет implicit `pb` через grid-rows; дополнительно проверяем что list-pane не имеет фиксированного `h-screen` который бы overflow'ил. |
| iOS Safari address-bar resize ломает 100vh | Средняя | `h-screen` (= 100vh) только в shell-контейнере; внутренние scrollable области используют `h-full`/`overflow-y-auto`. Если выявится проблема — заменить на `100dvh` точечно. |
| `useSectionTitle` race condition при быстрой навигации | Низкая | `useEffect` cleanup — clear title at unmount. Если две страницы рендерятся одновременно (редкий случай в React Router), последняя выигрывает (последний `useEffect` setter применится последним). |
| Permission-gated bottom-nav показывает 0 items для модератора | Средняя | Модератор имеет `view_own_tasks` → видит ✓ Задачи. Минимум 1 item всегда. Дашборд always-visible. |
| Hot reload теряет SectionTitleProvider state | Низкая | Acceptable — full page reload восстановит state. Не пишем тест на dev-only поведение. |

---

## 7. Testing strategy

### 7.1 Unit tests (Vitest + Testing Library)

**`MobileShell.test.jsx`**
- Renders TopBar, Outlet, BottomNav при `useIsMobile()=true`.
- `drawerOpen` state controlled через TopBar's onClick.
- Drawer closes on `location.pathname` change.

**`MobileTopBar.test.jsx`**
- Default state: гамбургер + title из контекста + 🔔 (если superadmin).
- `backTo` truthy: ← вместо ☰; click → `navigate(backTo)`.
- 🔔 badge from `usePendingDeletionCount` (mock); hidden если не superadmin.
- Title fallback на `routeToTitle` если context.title пустой.

**`MobileBottomNav.test.jsx`**
- Mock `useAuth` для каждой роли (superadmin, teamlead, moderator, operator); проверяем какие items видны.
- Active state: `<NavLink>` получает `aria-current="page"` для текущего route.
- Badge на «Задачи» из `useUserOverdueCount` mock.

**`MobileNavDrawer.test.jsx`**
- `open=true` → видны секции (Профиль / Настройки / Админ для superadmin / Logout).
- `open=false` → ничего не рендерится (или Base UI hides).
- Click на logout → `logout()` mock called.
- Theme switch → mock `setTheme` called.
- Админ-секция hidden для non-superadmin.

**`useSectionTitle.test.js`**
- Provider без вызова `useSectionTitle` → context default `''`.
- Hook на mount → `setTitle` called with title.
- Hook на unmount → `setTitle('')`.
- Re-render с новым title → `setTitle` called again.

**`MasterDetailLayout.test.jsx` (расширение):**
- Mock `useIsMobile=true` + `detailEmpty=true` → рендерит только listPane.
- Mock `useIsMobile=true` + `detailEmpty=false` → рендерит только children.
- Mock `useIsMobile=false` → рендерит обе панели (desktop, как сейчас).

**`AppShell.test.jsx` (расширение):**
- Mock `useIsMobile=true` → renders `MobileShell` элемент (selector `data-slot="mobile-shell"`).
- Mock `useIsMobile=false` → renders текущий desktop layout.

### 7.2 No e2e

В проекте нет Playwright/Cypress инфры. Mobile-specific flow'ы проверяются через DevTools device emulation вручную (см. acceptance criteria § 5).

### 7.3 Visual regression

Не делаем — у проекта нет visual regression инфры. Manual checklist в § 5 покрывает.

---

## 8. Implementation phases

(Plan written separately; spec lists phases без подробных шагов.)

1. **Phase 1 — Foundation:** `useSectionTitle` hook + Context, тесты. Single-file delivery.
2. **Phase 2 — Mobile shell components:** `MobileTopBar` + `MobileBottomNav` + `MobileNavDrawer` + `MobileShell` + their tests. Standalone, не подключены к `AppShell`.
3. **Phase 3 — AppShell branch:** добавить `useIsMobile()` в `AppShell.jsx`, рендерить `MobileShell` на mobile. Расширить `AppShell.test.jsx`.
4. **Phase 4 — MasterDetailLayout branch + page wiring:** добавить `detailEmpty` prop, mobile branch, обновить 4 page-файла + 4 detail-panel-файла с `useSectionTitle` calls. Расширить `MasterDetailLayout.test.jsx`.
5. **Phase 5 — Slide-out responsive:** обновить 4 `Create*SlideOut.jsx` с `useIsMobile` для `Sheet side` prop.
6. **Phase 6 — Standalone pages title:** `DashboardPage` + `NotificationsPage` — добавить `useSectionTitle` calls.
7. **Phase 7 — Manual verification + memory updates:** пройти acceptance checklist, обновить memory.

Каждая фаза мерджится отдельным коммитом внутри одного PR (или используется subagent-driven flow с code review per phase, как в 6B/6D — это решит writing-plans skill).

---

## 9. Open questions / decisions log

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | One PR or multiple? | One PR (shell only); per-page polish — separate PRs after | Brainstorm Q1; user pick «B» |
| 2 | Drawer-only / bottom-nav-only / hybrid? | TopBar (☰ + 🔔) + BottomNav + side-drawer | Brainstorm Q2-Q3; reference shell7 + user refinement про fixed header |
| 3 | List↔detail flow | Push-only navigation; bottom-sheet quick-switch deferred | Brainstorm Q4; user pick «α» |
| 4 | Bottom-sheet snap-points для slide-out forms | Single height `h-[90vh]` без snap-points | Section 4 — user «на твоё усмотрение» |
| 5 | Touch target size | `min-h-11 min-w-11` (44px Apple HIG) | Section 4 — user «на твоё усмотрение» |
| 6 | `🔔` placement | TopBar right (не в drawer) | Section 2 approval |
| 7 | Theme submenu | Inline items в drawer (не separate sheet) | Section 2 approval |
| 8 | `useSectionTitle` API | Context + hook (не route metadata table) | Section 1 approval — flexible enough для detail-страниц с динамическим title |
| 9 | `detailEmpty` source | Page вычисляет через `useParams`, передаёт явно | Section 3 — explicit > magical, у каждой страницы свой param-name |
| 10 | Scroll position restoration list↔detail | Out of scope этого PR | Section 3 approval |
