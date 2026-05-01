# Admin Section Redesign — Subplan 7-shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести `/admin/*` route внутрь основного `AppShell` (RailNav всегда виден), создать новый `AdminShell` sub-sidebar 220px на DS-токенах + shadcn primitives + lucide иконках, удалить `AdminLayout` overlay. Внутренние секции (`PlatformsSection`, `AdminAgenciesPage`) остаются legacy — их перепишут субпланы 7-agencies / 7-platforms.

**Architecture:** В `App.jsx` `/admin/*` route переезжает внутрь `<Route element={<AppShell />}>` как nested route (parent `<AdminShell />` + два child маршрута, монтирующие существующие секции в `<Outlet>`). `AdminShell` — простой презентационный shell: `grid-cols-[220px_1fr]` aside (header «Настройки» + два `NavLink` пункта с lucide иконками `Server` / `Building2`) + `<main><Outlet/></main>`. NavLink сам выставляет `aria-current="page"` и кастомный `className` через callback (с `end={false}` чтобы вложенные tab-маршруты будущих субпланов 7-agencies/7-platforms подсвечивали родительский пункт).

**Tech Stack:** React 19 + Vite + Vitest + React Testing Library + Tailwind CSS v4 + shadcn/ui (Button утилиты `cn`) + react-router-dom v6 (`NavLink`, `Outlet`, nested routes) + lucide-react (`Server`, `Building2`).

**Reference patterns (read before coding):**
- `src/components/shell/AppShell.jsx` — структура grid-cols + Outlet
- `src/components/shell/RailNav.jsx` — active-state pattern (lucide иконки + Button variant ghost + accent classes)
- `src/components/shell/AppShell.test.jsx` — vitest + MemoryRouter + Routes test setup
- `src/components/shell/index.js` — convention re-exports
- `src/App.jsx` — текущая позиция `/admin/*` route (строки 89-99)

**Spec:** [`docs/superpowers/specs/2026-05-01-admin-section-redesign-shell-design.md`](../specs/2026-05-01-admin-section-redesign-shell-design.md)

---

## File Structure

**Created:**
- `src/components/admin-shell/AdminShell.jsx` — sub-sidebar layout component (~70 LOC)
- `src/components/admin-shell/AdminShell.test.jsx` — unit tests (~80 LOC, 5 it-blocks)
- `src/components/admin-shell/index.js` — re-export

**Modified:**
- `src/App.jsx` — переехать `/admin/*` внутрь `<AppShell>`; импорт `AdminShell` вместо `AdminLayout`; добавить импорты `PlatformsSection` + `AdminAgenciesPage` (раньше импортировались внутри `AdminLayout`); убрать неиспользуемые `useNavigate` + `signOut` destructure.

**Deleted:**
- `src/AdminLayout.jsx` (114 LOC)

**Branching:** Feature branch `feat/subplan-7-shell` off main.

---

## Task 0: Pre-flight & branch

**Files:** none (read-only checks)

- [ ] **Step 1: Verify clean working tree on main**

Run: `git status`
Expected: `On branch main`, `nothing to commit, working tree clean`. Pull latest if needed: `git pull --ff-only`.

- [ ] **Step 2: Create feature branch**

Run: `git checkout -b feat/subplan-7-shell`
Expected: `Switched to a new branch 'feat/subplan-7-shell'`

- [ ] **Step 3: Pre-flight grep — `AdminLayout` consumers**

Run: `grep -rn "AdminLayout" src/ docs/ --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx"`

Expected output (only these matches):
- `src/AdminLayout.jsx` — сам файл (definition).
- `src/App.jsx:5` — `import AdminLayout from './AdminLayout.jsx'`.
- `src/App.jsx:90` — `element={ <AdminLayout ... /> }`.

Если есть ЛЮБЫЕ другие code-references — остановиться и обсудить (план опирается на то, что `AdminLayout` импортируется только в `App.jsx`). Markdown-упоминания в `docs/` игнорируем.

- [ ] **Step 4: Pre-flight grep — что станет orphaned после удаления `AdminLayout`**

Run: `grep -n "useNavigate\|signOut" src/App.jsx`

Expected output:
```
1:import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
32:  const { user, loading, signOut } = useAuth()
33:  const navigate = useNavigate()
94:              onClose={() => navigate('/')}
95:              onLogout={signOut}
```

Это подтверждает: `useNavigate` и `signOut` используются в App.jsx **только** для пропсов `AdminLayout`. После Task 3 их можно безопасно убрать.

- [ ] **Step 5: Baseline tests + build**

Run: `pnpm install --frozen-lockfile`
Run: `pnpm test --run`
Expected: всё зелёное (number-of-tests baseline зафиксировать в голове / черновике).

Run: `pnpm build`
Expected: clean build, no errors.

Если baseline красный — починить main отдельным PR'ом до старта этого subplan'а.

---

## Task 1: AdminShell — TDD (test + implement)

**Files:**
- Create: `src/components/admin-shell/AdminShell.test.jsx`
- Create: `src/components/admin-shell/AdminShell.jsx`

Это TDD-цикл: пишем все 5 тестов сразу (они все падают, потому что компонент ещё не существует), потом реализуем минимальный компонент, проходящий все тесты.

- [ ] **Step 1: Создать директорию для модуля**

Run: `mkdir -p src/components/admin-shell`

- [ ] **Step 2: Написать `AdminShell.test.jsx` со всеми 5 тестами**

Создать файл `src/components/admin-shell/AdminShell.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import { AdminShell } from './AdminShell.jsx'

function renderAtPath(path = '/admin/platforms') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route
            path="platforms"
            element={<div data-testid="section-content">platforms-content</div>}
          />
          <Route
            path="platforms/:foo"
            element={<div data-testid="section-content">platforms-sub</div>}
          />
          <Route
            path="agencies"
            element={<div data-testid="section-content">agencies-content</div>}
          />
          <Route
            path="agencies/:agencyId/:tab"
            element={<div data-testid="section-content">agencies-tab</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminShell', () => {
  it('renders the «Настройки» header', () => {
    renderAtPath('/admin/platforms')
    expect(
      screen.getByRole('heading', { name: 'Настройки' }),
    ).toBeInTheDocument()
  })

  it('renders both navigation items as links', () => {
    renderAtPath('/admin/platforms')
    expect(
      screen.getByRole('link', { name: /Платформы/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Агентства/i }),
    ).toBeInTheDocument()
  })

  it('marks the active section based on URL (top-level)', () => {
    renderAtPath('/admin/platforms')
    const platforms = screen.getByRole('link', { name: /Платформы/i })
    const agencies = screen.getByRole('link', { name: /Агентства/i })
    expect(platforms).toHaveAttribute('aria-current', 'page')
    expect(agencies).not.toHaveAttribute('aria-current')
  })

  it('keeps section active on nested URL (end={false})', () => {
    renderAtPath('/admin/agencies/123/contacts')
    const agencies = screen.getByRole('link', { name: /Агентства/i })
    const platforms = screen.getByRole('link', { name: /Платформы/i })
    expect(agencies).toHaveAttribute('aria-current', 'page')
    expect(platforms).not.toHaveAttribute('aria-current')
  })

  it('renders child route content via Outlet', () => {
    renderAtPath('/admin/platforms')
    expect(screen.getByTestId('section-content')).toHaveTextContent(
      'platforms-content',
    )
  })
})
```

- [ ] **Step 3: Запустить тесты — все 5 должны упасть с «module not found»**

Run: `pnpm test --run src/components/admin-shell/AdminShell.test.jsx`

Expected: 5 failed; ошибка вида `Failed to resolve import "./AdminShell.jsx"` или `Cannot find module`.

Если упало с другой ошибкой — диагностировать перед переходом к шагу 4.

- [ ] **Step 4: Создать `AdminShell.jsx`**

Создать файл `src/components/admin-shell/AdminShell.jsx`:

```jsx
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
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
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

- [ ] **Step 5: Запустить тесты — все 5 должны пройти**

Run: `pnpm test --run src/components/admin-shell/AdminShell.test.jsx`

Expected: 5 passed.

Если что-то падает:
- «Cannot resolve `@/lib/utils`» → проверить, что `vite.config.js` имеет `@` alias на `src` (имеет — используется во всех shell-компонентах). Если alias не работает в этом тестовом окружении — заменить на относительный путь `../../lib/utils.js`. Проверить наличие файла `src/lib/utils.js` (должен экспортировать `cn`).
- «Cannot resolve `lucide-react`» → пакет должен быть в dependencies (используется в RailNav). Если нет — `pnpm add lucide-react`.
- Тест на `aria-current` падает → убедиться, что `NavLink` импортирован из `react-router-dom` (v6 проставляет этот атрибут автоматически, когда callback `className` отрабатывает с `isActive=true`).

- [ ] **Step 6: Прогнать lint**

Run: `pnpm lint src/components/admin-shell/`

Expected: без ошибок.

- [ ] **Step 7: Прогнать полный test suite — нет регрессий**

Run: `pnpm test --run`

Expected: предыдущий baseline + 5 новых passes.

- [ ] **Step 8: Commit**

Run:
```bash
git add src/components/admin-shell/AdminShell.jsx src/components/admin-shell/AdminShell.test.jsx
git commit -m "feat(admin-shell): add AdminShell sub-sidebar component (DS tokens + lucide)"
```

---

## Task 2: index.js re-export

**Files:**
- Create: `src/components/admin-shell/index.js`

Соблюдает convention из `src/components/shell/index.js`.

- [ ] **Step 1: Создать `index.js`**

Создать файл `src/components/admin-shell/index.js`:

```js
export { AdminShell } from './AdminShell.jsx'
```

- [ ] **Step 2: Sanity check — импорт работает**

Run: `node --input-type=module -e "import('./src/components/admin-shell/index.js').then(m => console.log(Object.keys(m)))"`

Expected: `[ 'AdminShell' ]`.

(Если node не умеет резолвить .jsx без транспиляции — пропустить этот шаг; реальная проверка будет в Task 3 через сборку Vite.)

- [ ] **Step 3: Commit**

Run:
```bash
git add src/components/admin-shell/index.js
git commit -m "chore(admin-shell): add index.js re-export"
```

---

## Task 3: App.jsx wiring + AdminLayout removal

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/AdminLayout.jsx`

Это атомарное изменение: переехать `/admin/*` route внутрь `<AppShell>`, заменить `AdminLayout` на `AdminShell`, удалить orphaned файл. Тесты + smoke в одном коммите.

- [ ] **Step 1: Прочитать `src/App.jsx` целиком**

Read: `src/App.jsx`

Запомнить:
- Строка 1: `import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'` — `useNavigate` уйдёт.
- Строка 5: `import AdminLayout from './AdminLayout.jsx'` — заменится.
- Строка 30: `import { isSuperadmin } from './lib/permissions.js'` — остаётся.
- Строки 32-33: `const { user, loading, signOut } = useAuth(); const navigate = useNavigate()` — `signOut` и `navigate` уйдут.
- Строки 89-99: блок `{isSuperadmin(user) && (<Route path="/admin/*" element={<AdminLayout ... />} />)}` — переезжает внутрь `<Route element={<AppShell />}>` с новой структурой.

- [ ] **Step 2: Заменить imports**

В `src/App.jsx`:

Удалить из строки 1:
```jsx
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
```
Заменить на:
```jsx
import { Routes, Route, Navigate } from 'react-router-dom'
```

Удалить строку:
```jsx
import AdminLayout from './AdminLayout.jsx'
```

Добавить (рядом с другими импортами компонентов):
```jsx
import { AdminShell } from './components/admin-shell/index.js'
import PlatformsSection from './sections/PlatformsSection'
import AdminAgenciesPage from './pages/AdminAgenciesPage'
```

(Импорты `PlatformsSection` и `AdminAgenciesPage` раньше были внутри `AdminLayout.jsx` — теперь нужны в `App.jsx`, потому что монтируются как child routes напрямую.)

- [ ] **Step 3: Убрать неиспользуемые destructures**

В функции `App()`, строки 32-33, заменить:

```jsx
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()
```

на:

```jsx
  const { user, loading } = useAuth()
```

- [ ] **Step 4: Переехать `/admin/*` route внутрь `<AppShell>`**

В `src/App.jsx` найти блок:

```jsx
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
```

Удалить его полностью.

Затем в `<Route element={<AppShell />}>` блоке (после `<Route path="/notifications" element={<NotificationsPage />} />`) добавить:

```jsx
        {isSuperadmin(user) && (
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate to="platforms" replace />} />
            <Route path="platforms/*" element={<PlatformsSection />} />
            <Route path="agencies/*" element={<AdminAgenciesPage />} />
          </Route>
        )}
```

Финальный фрагмент `<Route element={<AppShell />}>` блока должен выглядеть так:

```jsx
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/staff" element={<StaffListPage />}>
          {/* ...без изменений... */}
        </Route>
        <Route path="/staff/new" element={<Navigate to="/staff" replace />} />
        <Route path="/clients" element={<ClientListPage />}>
          {/* ...без изменений... */}
        </Route>
        <Route path="/teams" element={<TeamListPage />}>
          {/* ...без изменений... */}
        </Route>
        <Route path="/tasks" element={<TaskListPage />}>
          {/* ...без изменений... */}
        </Route>
        <Route path="/notifications" element={<NotificationsPage />} />
        {isSuperadmin(user) && (
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate to="platforms" replace />} />
            <Route path="platforms/*" element={<PlatformsSection />} />
            <Route path="agencies/*" element={<AdminAgenciesPage />} />
          </Route>
        )}
      </Route>
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
```

- [ ] **Step 5: Запустить полный test suite**

Run: `pnpm test --run`

Expected: всё зелёное. Если App.jsx где-то использовался в тестах с моком на `AdminLayout` — найти и обновить. (Pre-flight grep в Task 0 показал, что `AdminLayout` нет в тестах. Если что-то всплыло — проверить grep шире.)

- [ ] **Step 6: Подтвердить отсутствие ссылок на `AdminLayout` перед удалением файла**

Run: `grep -rn "AdminLayout" src/ --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx"`

Expected: только `src/AdminLayout.jsx` (сам файл).

- [ ] **Step 7: Удалить `src/AdminLayout.jsx`**

Run: `git rm src/AdminLayout.jsx`

- [ ] **Step 8: Build + lint sanity**

Run: `pnpm build`
Expected: clean build.

Run: `pnpm lint`
Expected: без новых ошибок (особенно «unused import» — должно быть чисто).

Run: `pnpm test --run`
Expected: всё зелёное.

- [ ] **Step 9: Commit**

Run:
```bash
git add src/App.jsx
git commit -m "feat(admin): wire AdminShell into AppShell; remove AdminLayout overlay"
```

---

## Task 4: Manual smoke test in browser

**Files:** none (runtime check)

- [ ] **Step 1: Запустить dev-сервер**

Run: `pnpm dev`

Открыть http://localhost:5173 (или на каком порту запустится).

- [ ] **Step 2: Login as superadmin**

Залогиниться superadmin'ом (любой existing аккаунт с role=superadmin).

- [ ] **Step 3: Сценарий — вход в /admin через user menu**

Кликнуть на аватар (правый верхний угол) → user menu → «Настройки».

Expected:
- URL меняется на `/admin/platforms` (через index redirect).
- Слева виден основной RailNav (56px) с иконками всех разделов.
- Справа от RailNav — sub-sidebar 220px с header «Настройки» и двумя пунктами «Платформы» (icon Server) + «Агентства» (icon Building2).
- Пункт «Платформы» подсвечен (`bg-accent` + полоска `bg-primary` слева).
- Справа от sub-sidebar — legacy `PlatformsSection` (card-grid в прежнем slate/indigo виде; это OK — DS-репейнт секций будет в следующих субпланах).

- [ ] **Step 4: Сценарий — переключение между секциями**

Клик «Агентства» в sub-sidebar.

Expected:
- URL меняется на `/admin/agencies`.
- Активный пункт сменился на «Агентства».
- Справа — legacy `AdminAgenciesPage` (table + при клике по строке — drawer; всё работает как было).

Клик «Платформы» обратно.

Expected:
- URL `/admin/platforms`, активен «Платформы», legacy секция отрендерена.

- [ ] **Step 5: Сценарий — выход из /admin через RailNav**

Не закрывая /admin, кликнуть в RailNav любую другую иконку (например /clients).

Expected:
- Переход в /clients без артефактов.
- Sub-sidebar admin'а пропадает (только RailNav + основной канвас).

- [ ] **Step 6: Сценарий — deep link на любую секцию**

Перейти прямо по URL (например через адресную строку): `/admin` (без сегмента).

Expected: редирект на `/admin/platforms` (через index Route).

Перейти по `/admin/agencies/123/contacts` (несуществующий tab — этот subplan его не реализует).

Expected: страница не падает; sub-sidebar показывает «Агентства» как активный (`end={false}` работает); справа — `AdminAgenciesPage` (legacy его игнорирует, т.к. tabs ещё не подключены, но fallthrough OK).

- [ ] **Step 7: Сценарий — non-superadmin не имеет доступа**

Logout. Залогиниться обычным admin'ом или operator'ом (НЕ superadmin).

Открыть прямо `/admin` через адресную строку.

Expected: редирект на `/` (защита `isSuperadmin(user)` в App.jsx остаётся работать; `<Route path="*" element={<Navigate to="/" replace />} />` срабатывает, потому что admin route conditionally скипается).

- [ ] **Step 8: Сценарий — функциональность legacy секций не сломана**

Под superadmin'ом снова открыть /admin/agencies. Создать тестовое агентство (`+ Новое агентство` → modal → submit). Открыть его (drawer). Сохранить branding. Закрыть. Архивировать.

Expected: всё работает как до этого subplan'а (regression check).

- [ ] **Step 9: Зафиксировать результат smoke test'а в черновике PR-описания**

Записать (для последующего PR description) что-то вроде:
```
- Manual smoke OK: settings entry → /admin/platforms; nav switch; deep links; non-superadmin redirect; legacy sections (create agency / edit / archive) regress-clean.
```

---

## Task 5: Final validation + memory update + PR

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md` (memory вне репо)

- [ ] **Step 1: Финальный full test/build/lint**

Run (в последовательности):
```bash
pnpm test --run
pnpm build
pnpm lint
```

Expected: всё зелёное.

- [ ] **Step 2: Обновить memory `project_ds_rollout_roadmap.md`**

Read: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`

Найти секцию «Done (merged to main)» (список subplans). Добавить запись:

```
- 7-shell (admin shell migration to AppShell): /admin/* moved inside AppShell; new AdminShell sub-sidebar 220px (DS tokens + lucide Server/Building2); AdminLayout overlay deleted (114 LOC). Sections (PlatformsSection, AdminAgenciesPage) still legacy — repaint deferred to 7-agencies / 7-platforms. PR #<TBD>.
```

(Номер PR подставить после `gh pr create` в Step 5.)

В секции «Far-future» удалить строку:
```
- Subplan 7 = AdminLayout cleanup (legacy `components/ui.jsx` `<Modal>` consumers: AdminPanel, sections/PlatformsSection, sections/AgenciesSection)
```

— она устарела (PR #62 уже удалил AdminPanel и AgenciesSection; этот subplan удалил AdminLayout overlay; Modal-консьюмеры остаются только в `PlatformsSection`, что покроет 7-platforms).

В разделе «Queue» добавить (если ещё нет):
```
**Subplan 7-track (admin section DS rebuild) — IN PROGRESS:**
- ~~7-shell~~ — DONE.
- 7-agencies — master-detail + 3 tabs (branding/contacts/admins) + Sheet/Dialog. Spec & plan TBD.
- 7-platforms — master-detail + 2 tabs (branding/contacts) + Sheet/Dialog. Spec & plan TBD.
```

- [ ] **Step 3: Убедиться, что ветка чистая локально**

Run: `git status`
Expected: `working tree clean` (все нужные коммиты сделаны).

Run: `git log --oneline main..HEAD`
Expected: 3 коммита:
1. `feat(admin-shell): add AdminShell sub-sidebar component (DS tokens + lucide)`
2. `chore(admin-shell): add index.js re-export`
3. `feat(admin): wire AdminShell into AppShell; remove AdminLayout overlay`

- [ ] **Step 4: Push branch**

Run: `git push -u origin feat/subplan-7-shell`

- [ ] **Step 5: Открыть PR**

Run:
```bash
gh pr create --title "feat(admin): subplan 7-shell — AdminShell + AppShell integration" --body "$(cat <<'EOF'
## Summary
- `/admin/*` route переехал внутрь основного `AppShell` — RailNav теперь всегда виден на admin-страницах.
- Новый `AdminShell` sub-sidebar (220px) на DS-токенах + shadcn утилитах + lucide иконках (`Server`, `Building2`).
- `AdminLayout` overlay (`fixed inset-0` со своим 240px sidebar) удалён (114 LOC).
- Внутренние секции (`PlatformsSection`, `AdminAgenciesPage`) **остаются legacy** — DS-репейнт каждой → отдельные субпланы 7-agencies и 7-platforms.

Spec: `docs/superpowers/specs/2026-05-01-admin-section-redesign-shell-design.md`
Plan: `docs/superpowers/plans/2026-05-01-admin-section-redesign-shell.md`

## Test plan
- [ ] User menu → Настройки → `/admin/platforms` (default redirect сохранён).
- [ ] RailNav слева виден; sub-sidebar 220px с двумя пунктами (Server / Building2 иконки).
- [ ] Active state корректен на `/admin/platforms` и `/admin/agencies`.
- [ ] Nested URL `/admin/agencies/123/contacts` подсвечивает «Агентства» (NavLink с `end={false}`).
- [ ] Переход из /admin в /clients (через RailNav) работает без артефактов.
- [ ] Non-superadmin → /admin → редирект на `/`.
- [ ] Legacy секции (create / edit / archive агентства, CRUD платформы) — без регрессий.
- [ ] `pnpm test --run`, `pnpm build`, `pnpm lint` — зелёные.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: вывод с URL созданного PR. Скопировать его номер для memory update.

- [ ] **Step 6: Обновить memory с реальным PR-номером**

Edit: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`

Заменить `PR #<TBD>` на реальный номер из Step 5.

- [ ] **Step 7: Перед merge — переключиться на правильный gh-аккаунт**

Memory `project_gh_auth.md`: `gh pr merge` падает под `temashdesign`; нужен `clubmonaco2017-ops`.

Run: `gh auth switch --user clubmonaco2017-ops`

- [ ] **Step 8: Merge после approve**

Run: `gh pr merge --squash --delete-branch`

Expected: PR закрыт, ветка удалена.

- [ ] **Step 9: Deploy**

Memory `project_vercel_deploy.md`: deploy через CLI, scope `clubmonaco2017-ops-projects`.

Run:
```bash
git checkout main && git pull --ff-only
vercel --prod
```

Expected: production deploy успешен.

---

## Self-review (после написания плана — выполнено перед сдачей)

1. **Spec coverage** — каждый раздел spec'а покрыт задачей:
   - Goal 1 (RailNav всегда виден) — Task 3 (App.jsx routing change).
   - Goal 2 (AdminShell 220px DS+shadcn+lucide) — Task 1 (TDD цикл).
   - Goal 3 (AdminLayout удалён) — Task 3 Step 7.
   - Goal 4 (existing /admin/platforms /admin/agencies routes работают) — Task 3 Step 4 (child routes mounted) + Task 4 (smoke checks).
   - Goal 5 (default `/admin` → `/admin/platforms`) — Task 3 Step 4 (`<Route index element={<Navigate to="platforms" replace />} />`).
   - Test plan unit — Task 1 (5 it-blocks).
   - Test plan integration smoke — Task 4 (8 сценариев).
   - Risks: deep-link, mismatch, AdminLayout.test.jsx — все обработаны через pre-flight grep'ы Task 0 + smoke Task 4.

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные. Единственный TBD — номер PR в memory update — это нормально, заполняется в Step 6 после `gh pr create`.

3. **Type / naming consistency**:
   - Component name `AdminShell` — единообразно во всех 5 задачах.
   - Импортный путь `./components/admin-shell/index.js` — единообразно (Task 2 + Task 3 Step 2).
   - SECTIONS array keys (`platforms`, `agencies`) совпадают с route paths и lucide иконками.
   - `NavLink` с `end={false}` — везде где есть test (Task 1 Step 2) или impl (Task 1 Step 4).
   - `aria-current="page"` — react-router-dom v6 default behavior, проверено в Task 1 Step 2 testов.

4. **Out-of-scope чистота**: ни одна задача не трогает `PlatformsSection.jsx`, `AdminAgenciesPage.jsx`, `AgencyDetailPanel.jsx` или sub-fields — это субпланы 7-agencies / 7-platforms.
