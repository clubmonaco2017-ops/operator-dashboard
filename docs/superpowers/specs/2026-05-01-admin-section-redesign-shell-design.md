# Admin Section Redesign — Subplan 7-shell Design

**Date:** 2026-05-01
**Status:** Spec — awaiting user review

## Summary

Часть 1 из 3 в редизайне `/admin` под общий стиль сайта (DS-токены + shadcn primitives + lucide иконки). Этот subplan покрывает только **shell-слой**: интегрирует `/admin/*` в основной `AppShell` (RailNav всегда виден), создаёт новый `AdminShell` sub-sidebar 220px шириной, удаляет `AdminLayout` overlay. Внутренние секции (`PlatformsSection`, `AdminAgenciesPage`) **остаются как есть** — их перепишут субпланы 7-agencies (master-detail + 3 tabs + Sheet) и 7-platforms (master-detail + 2 tabs + Sheet).

После всех трёх субпланов `/admin` визуально и архитектурно соответствует остальному сайту (`/clients`, `/teams`, `/staff`, `/tasks`).

## Goals

1. RailNav остаётся всегда виден на `/admin/*` — суперадмин может перейти в любой основной раздел одним кликом.
2. `AdminShell` sub-sidebar (220px, иконка+label) использует DS-токены и shadcn `<Button variant="ghost">`. Активный пункт — `bg-accent text-accent-foreground` + полоска `bg-primary` слева (паттерн RailNav).
3. `AdminLayout` (`fixed inset-0` overlay со своим 240px sidebar) полностью удалён.
4. Существующие маршруты `/admin/platforms` и `/admin/agencies` продолжают работать без изменений (URL'ные tabs внутри секций добавятся в субпланах 7-agencies / 7-platforms).
5. Default `/admin` → `/admin/platforms` (сохраняем текущее поведение, установленное PR #62).

## Non-goals

- DS-перекраска `PlatformsSection.jsx` / `AdminAgenciesPage.jsx` / `AgencyDetailPanel.jsx` / `AgencyCreateModal.jsx` / `AgencyTable.jsx` / sub-fields. Сохраняется legacy slate/indigo + `<Modal>` overlay'и. **Это вход в субплан 7-agencies / 7-platforms.**
- Mobile responsive для `AdminShell`. На mobile сейчас остаётся single-column AppShell (без sub-sidebar). Доработка отложена до общего mobile-responsive подплана.
- Удаление любых RPC, миграций или серверных endpoints.
- Изменение `UserMenuDropdown` entry «Настройки» (уже ведёт на `/admin`).
- Темизация переключение / footer'ные кнопки в sub-sidebar — это уже есть в RailNav, не дублируем.

## Architecture

### Routing change

**Было** (`App.jsx`):

```jsx
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<DashboardPage />} />
    {/* ...основные маршруты... */}
  </Route>
  {isSuperadmin(user) && (
    <Route
      path="/admin/*"
      element={
        <AdminLayout
          onClose={() => navigate('/')}
          onLogout={signOut}
          currentUser={user}
        />
      }
    />
  )}
</Routes>
```

**Стало:**

```jsx
<Routes>
  <Route element={<AppShell />}>
    <Route path="/" element={<DashboardPage />} />
    {/* ...основные маршруты... */}
    {isSuperadmin(user) && (
      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<Navigate to="platforms" replace />} />
        <Route path="platforms/*" element={<PlatformsSection />} />
        <Route path="agencies/*" element={<AdminAgenciesPage />} />
      </Route>
    )}
  </Route>
</Routes>
```

`/admin/*` теперь — child route внутри `AppShell`. `AdminLayout` импорт удаляется. `useNavigate` для `onClose` тоже больше не нужен (RailNav уже навигирует обратно).

### `AdminShell` layout

```
┌──────┬─────────────────┬──────────────────────────────┐
│      │ Настройки       │                              │
│      │                 │                              │
│ Rail │ ▌ ⚙  Платформы  │  <Outlet> — секция            │
│ Nav  │   🏢 Агентства  │  (PlatformsSection или        │
│ 56px │                 │   AdminAgenciesPage —         │
│      │                 │   пока legacy)                │
│      │ 220px           │                              │
└──────┴─────────────────┴──────────────────────────────┘
```

Реализация:

```jsx
// src/components/admin-shell/AdminShell.jsx
import { NavLink, Outlet } from 'react-router-dom'
import { Server, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { key: 'platforms', label: 'Платформы', icon: Server,    to: '/admin/platforms' },
  { key: 'agencies',  label: 'Агентства', icon: Building2, to: '/admin/agencies' },
]

export function AdminShell() {
  return (
    <div className="grid grid-cols-[220px_1fr] h-full">
      <aside
        aria-label="Настройки"
        className="border-r border-border bg-card overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-border">
          <h1 className="text-sm font-semibold text-foreground">Настройки</h1>
        </div>
        <nav className="p-2 space-y-0.5">
          {SECTIONS.map(({ key, label, icon: Icon, to }) => (
            <NavLink
              key={key}
              to={to}
              end={false}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-r before:bg-primary'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

**Дизайн-решения:**
- 220px — фиксированная ширина (компромисс D2 из брейнсторма). Достаточно для иконки + label «Платформы»/«Агентства» + padding.
- `bg-card` для sub-sidebar — выделяет на фоне `main` canvas (тот наследует фон AppShell).
- Иконки lucide: `Server` (платформы) и `Building2` (агентства). Выбор соответствует RailNav (`Users`, `LayoutGrid` etc.) — везде lucide.
- NavLink с `end={false}` → активен на любых вложенных URL (`/admin/agencies/123/contacts` тоже подсветит «Агентства»).
- Полоска `bg-primary` слева — повторяет RailNav active state.
- НЕТ footer'а с «Выйти» — выход уже в `UserMenuDropdown` (правый верхний угол AppShell).
- НЕТ `currentUser?.email` подзаголовка — он есть в `UserMenuDropdown` avatar tooltip; не дублируем.

## File Plan

**Created:**
- `src/components/admin-shell/AdminShell.jsx` (~70 LOC)
- `src/components/admin-shell/AdminShell.test.jsx` (~70 LOC)
- `src/components/admin-shell/index.js` — re-export `AdminShell`

**Modified:**
- `src/App.jsx` — переехать `/admin/*` route внутрь `<AppShell>`; импорт `AdminShell`; удалить импорт `AdminLayout`; удалить использование `navigate` для `onClose`; default `/admin` redirect `platforms` → `agencies`.

**Deleted:**
- `src/AdminLayout.jsx` (114 LOC).

## Test Plan

### Unit (`AdminShell.test.jsx`)

1. Рендерится header «Настройки».
2. Рендерятся 2 nav item: «Платформы» (icon `Server`), «Агентства» (icon `Building2`).
3. При маршруте `/admin/platforms` пункт «Платформы» имеет `aria-current="page"` (через `NavLink`) и `bg-accent` класс. «Агентства» — нет.
4. При маршруте `/admin/agencies/123/contacts` пункт «Агентства» активен (проверяет `end={false}`).
5. `<Outlet>` рендерит child route content (mock-route с тестовым компонентом).

### Integration (manual smoke в браузере)

- Логин superadmin → user menu → «Настройки» → `/admin` → редирект на `/admin/platforms` (без изменений).
- На `/admin/platforms` RailNav слева виден; sub-sidebar с двумя пунктами; справа legacy `PlatformsSection` (card-grid + modal работают).
- Клик «Агентства» в sub-sidebar → URL `/admin/agencies`, активен «Агентства», справа legacy `AdminAgenciesPage` (table + drawer работают).
- Клик любой иконки RailNav (например `Users` для /staff) → переход в основной раздел (без артефактов от admin overlay'я).
- Прямой URL `/admin/agencies/123/contacts` (несуществующий пока tab) — не падает, fallthrough на legacy section.
- Non-superadmin → `/admin` → редирект на `/` (защита в `App.jsx` через `isSuperadmin(user)` остаётся).

### Build / lint
- `pnpm test --run` — все тесты зелёные (новые `AdminShell.test.jsx` + старые без регрессий).
- `pnpm build` — clean.
- `pnpm lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Визуальный mismatch: новый shell + legacy sections внутри (живёт ~24h до 7-agencies) | /admin доступен только superadmin'у — единственный наблюдатель сам автор. Acceptable. |
| Deep-link `/admin` ломается | `<Route index element={<Navigate to="platforms" replace />} />` сохраняет текущее поведение. |
| Тесты `App.test.jsx` (если они есть) могут зависеть от структуры роутинга | Pre-flight grep `/admin` в тестах; если есть — обновить. |
| Пользователь ожидает overlay-метафору («настройки в отдельном окне») | Сознательное решение из брейнсторма (вариант D). RailNav всегда виден — это feature, не bug. |
| `AdminLayout.test.jsx` (если существует) станет невалидным | Pre-flight check; удалить вместе с `AdminLayout.jsx` если есть. |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные, не пересекаются.
- [x] Routing diff корректный (proverено against App.jsx:80-99).
- [x] `AdminShell` JSX компилируется концептуально (cn import, NavLink children-as-function, lucide imports).
- [x] Удаляемый `AdminLayout.jsx` действительно ничего не экспортирует наружу кроме default export, который импортируется только в `App.jsx`.
- [x] Default redirect сохраняется как `platforms` (без поведенческих изменений).
- [x] Subplan не делает работу, которая принадлежит 7-agencies / 7-platforms (sections внутри не трогаются).
- [x] Tests cover NavLink active state с `end={false}` (специфично для nested routes субпланов 7-agencies/7-platforms).
