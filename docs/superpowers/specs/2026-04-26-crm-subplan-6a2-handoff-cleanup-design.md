# CRM Subplan 6A2 — Handoff & Cleanup · Design Spec

**Status:** Brainstormed · approved.
**Author:** Claude Code (Opus 4.7) + Artem.
**Date:** 2026-04-26.
**Implements:** 6A code-review handoff (Important issues I-1, I-2, I-3) + dead-code cleanup. Mini-PR.

**Builds on:**
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) (DS tokens, lucide sweep, primitives install + universal `:focus-visible` rule).
- [Subplan 6A Shell Rebuild spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) (three-pane shell, master-detail lift).

---

## 1. Goal & non-goals

**Goal:** Закрыть три Important issues из 6A code review (SearchInput dup×3, outlet context shape variance, missing aria-labels) + dead-code cleanup (`.focus-ds` redundant after universal `:focus-visible`, unused `ui/sidebar.jsx`, unused `.ref-code` / `.editable-text` utility classes). Никакого визуального repaint, никаких shadcn primitive sweeps, никаких новых features. **Mini-PR: ~10-12 logic file changes + ~50 mechanical class-removal sweeps.**

**В scope:**

- Создать `<SearchInput>` в `src/components/shell/`, заменить 3 локальные копии (Clients/Teams/Tasks).
- Добавить optional `listLabel` / `detailLabel` props к `<MasterDetailLayout>`; заполнить из master-detail страниц.
- Унифицировать outlet context на `{rows, reload}` + page-specific extras (`box`, `basePath` для Tasks). Убрать `user`/`callerId` из context — DetailRoute компоненты читают `useAuth()` сами.
- Sweep `.focus-ds` class (80 usages → 0). Удалить definition из `src/index.css`.
- Удалить `src/components/ui/sidebar.jsx` (669 строк, 0 production usage).
- Удалить `.ref-code` и `.editable-text` definitions из `src/index.css` (0 usages).
- Smoke: 196+ baseline tests + ~3 new for SearchInput.

**Out of scope (deferred):**

- **Subplan 6A3** — DashboardPage full rewrite + KpiCard refactor (`icon={Component}` pattern).
- **Subplan 6A4** — utility-class sweep (`.btn-primary` / `.btn-ghost` / `.btn-danger-ghost` / `.surface-card` → shadcn `<Button>` / `<Card>`; ~108 elements в ~50 файлов) + visual repaint per page (apply DS preview HTMLs).
- **Subplan 6B** — mobile shell (bottom-tabs, drawer, bottom-sheet).
- AdminLayout cleanup → Subplan 7.
- Восстановление footer counters / kbd `/` indicator (если когда-то понадобятся — отдельная задача; в 6A они были дропнуты).
- Дальнейший рефактор `TeamDetailPanel` / `TaskDetailPanel` чтобы они сами читали `useAuth()` (сейчас принимают `user` как prop) — отдельный задача в 6A4 или Subplan 7.
- New tests for shell `<AppShell>` / `<RailNav>` / `<AppHeader>` с обновлёнными context shapes (existing tests not affected by these changes — outlet context shape change doesn't propagate to shell components).

---

## 2. Decisions log

| # | Решение | Rationale |
|---|---|---|
| **D-1** | Mini-6A2: только 6A handoff items + cleanup. Никакого визуального repaint, никакого primitive sweep. | Per Q1→B in brainstorm. Repaint требует нескольких циклов polish и subjective design choices; mini-PR low-risk закрывает 6A долги быстро и расчищает поле для 6A3 Dashboard rewrite. |
| **D-2** | Outlet context shape = `{rows, reload}` + page-specific extras (`box, basePath` для Tasks). DetailRoute компоненты читают `useAuth()` сами для user/callerId. | Per Q2→A. Минимум данных в context; стандартные хуки для остального; устраняет prop drilling `user` в Teams/Tasks. `callerId` (= `user?.id`) — derived в DetailRoute. |
| **D-3** | `<SearchInput>` контракт = `{placeholder, value, onChange, ariaLabel}`. Без kbd `/` indicator. | Per Q3→B. ariaLabel per-page (a11y); kbd shortcut deferred to whenever real keyboard handler appears (был в orig ClientListPage до 6A, дропнут в Stage 3 6A). |
| **D-4** | aria-labels на `MasterDetailLayout` = optional `{listLabel?, detailLabel?}` props. Pages передают по смыслу. | Per Q4→A. Не форсируем (required props) и не выдумываем default'ы — каждая страница сама знает свою семантику. |
| **D-5** | Mandatory sweep `.focus-ds` (80 usages → 0). Удалить class definition из `src/index.css`. | Per Q5→C. Universal `:where(button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])):focus-visible` rule (Subplan 6 Stage 1) полностью покрывает все interactive elements. `.focus-ds` стал redundant; cleanup pass для ясности. Безопасно: класс на не-interactive `<div>` без tabindex никогда не активирует focus-visible. |
| **D-6** | Удалить `src/components/ui/sidebar.jsx` (shadcn primitive bundled with application-shell7) + `.ref-code` + `.editable-text` definitions из `src/index.css`. | Per Q6→C. Confirmed zero production usage для всех трёх. shadcn `Sidebar` primitive — 669 строк, не понадобится в 6A3/6A4 (мы сами построили rail в 6A). `.ref-code` / `.editable-text` — never adopted utility classes. |

---

## 3. File changes

### Create

```
src/components/shell/SearchInput.jsx          # extracted shell component
src/components/shell/SearchInput.test.jsx     # contract tests (~3 assertions)
```

### Modify (logic)

```
src/components/shell/MasterDetailLayout.jsx       # add listLabel/detailLabel optional props
src/components/shell/MasterDetailLayout.test.jsx  # test new optional props
src/components/shell/index.js                     # export SearchInput
src/index.css                                     # remove .focus-ds, .ref-code, .editable-text definitions
src/pages/ClientListPage.jsx                      # use shell SearchInput; drop local SearchInput; outlet context = {rows, reload}; ClientDetailRoute reads useAuth(); pass listLabel/detailLabel
src/pages/TeamListPage.jsx                        # same pattern
src/pages/TaskListPage.jsx                        # same + retain box/basePath in context
```

### Modify (mechanical sweep `.focus-ds` from JSX — 80 usages, ~50 files)

```
src/components/clients/*.jsx, src/components/teams/*.jsx,
src/components/tasks/*.jsx, src/components/staff/*.jsx,
src/components/shell/*.jsx, src/pages/*.jsx, src/LoginPage.jsx
```

(Authoritative list: `grep -rln "focus-ds" src/components/ src/pages/ src/LoginPage.jsx`. Ожидается ~50 файлов.)

### Delete

```
src/components/ui/sidebar.jsx                     # 669 lines, 0 production usage
```

### NOT touched

- `src/AdminLayout.jsx` (legacy, Subplan 7).
- `src/LoginPage.jsx` *logic* (only `.focus-ds` mechanical sweep if applicable).
- `src/components/shell/{AppShell,RailNav,AppHeader,UserMenuDropdown,ListPane}.jsx` (work as-is; only sweep `.focus-ds` mechanically).
- `src/components/{clients,teams,tasks,staff}/*.jsx` *internals* (touched ТОЛЬКО для mechanical `.focus-ds` removal — class becomes redundant; no other changes).
- DB / migrations / hooks / lib — zero changes.
- All other shadcn primitives in `src/components/ui/` — only sidebar.jsx removed.

---

## 4. Component contracts

### 4.1. `<SearchInput placeholder, value, onChange, ariaLabel />`

```jsx
import { Search } from 'lucide-react'

export function SearchInput({ placeholder, value, onChange, ariaLabel }) {
  return (
    <label className="relative flex items-center">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary"
      />
    </label>
  )
}
```

- No `.focus-ds` (universal rule covers `<input>`).
- `value` and `onChange(value)` are controlled — caller manages state.
- `ariaLabel` optional but encouraged per-page.

### 4.2. `<MasterDetailLayout listPane, listLabel?, detailLabel?, children />` — обновлённый

```jsx
export function MasterDetailLayout({ listPane, listLabel, detailLabel, children }) {
  return (
    <div className="grid grid-cols-[320px_1fr] h-full">
      <aside aria-label={listLabel} className="border-r border-border bg-card overflow-y-auto">
        {listPane}
      </aside>
      <section aria-label={detailLabel} className="overflow-y-auto">
        {children}
      </section>
    </div>
  )
}
```

- `aria-label={undefined}` валидно — атрибут не рендерится (consistent с unlabeled landmarks current behavior).
- Both props optional. Backward-compatible.

### 4.3. Outlet context shapes (post-unification)

| Page | Context object |
|---|---|
| ClientListPage | `{ rows, reload }` |
| TeamListPage | `{ rows, reload }` |
| TaskListPage | `{ rows, reload, box, basePath }` |

Detail child routes:

```jsx
// ClientDetailRoute
const { user } = useAuth()
const { rows, reload } = useOutletContext()
const { clientId, tab } = useParams()
return (
  <ClientDetailPanel
    callerId={user?.id}
    clientId={clientId}
    activeTab={tab || 'profile'}
    siblings={rows}
    onChanged={reload}
  />
)

// TeamDetailRoute
const { user } = useAuth()
const navigate = useNavigate()
const { rows, reload } = useOutletContext()
const { teamId } = useParams()
return (
  <TeamDetailPanel
    callerId={user?.id}
    user={user}
    teamId={Number(teamId)}
    siblings={rows}
    onChanged={reload}
    onBack={() => navigate('/teams')}
  />
)

// TaskDetailRoute
const { user } = useAuth()
const navigate = useNavigate()
const { rows, reload, basePath } = useOutletContext()
const { taskId } = useParams()
return (
  <TaskDetailPanel
    callerId={user?.id}
    user={user}
    taskId={Number(taskId)}
    siblings={rows}
    onChanged={reload}
    onBack={() => navigate(basePath)}
    onDeleted={() => navigate(basePath)}
  />
)
```

Note: `TeamDetailPanel` and `TaskDetailPanel` сейчас принимают `user` как prop. Spec не trogает их internals — DetailRoute продолжает passing as prop. Refactor (DetailPanel reads useAuth itself) — отдельный задача в 6A4 или 7.

---

## 5. Per-page changes summary

| Page | Δ files | Changes |
|---|---|---|
| `ClientListPage.jsx` | 1 | Use shell `<SearchInput>` (drop local helper at bottom); outlet context = `{rows, reload}`; `ClientDetailRoute` reads `useAuth()` for callerId; pass `listLabel="Список клиентов"` + `detailLabel="Профиль клиента"` to `<MasterDetailLayout>`. Sweep `.focus-ds` from JSX. |
| `TeamListPage.jsx` | 1 | Same pattern. Labels: `"Список команд"` / `"Команда"`. |
| `TaskListPage.jsx` | 1 | Same + keep `box, basePath` in outlet context. Labels: `"Список задач"` / `"Задача"`. |
| `MasterDetailLayout.jsx` | 1 | Add `listLabel?, detailLabel?` props → render as `aria-label`. |
| `MasterDetailLayout.test.jsx` | 1 | Add 1-2 tests for label rendering. |
| `SearchInput.jsx` (new) | +1 | New shell component. |
| `SearchInput.test.jsx` (new) | +1 | ~3 contract tests. |
| `index.js` | 1 | Export `SearchInput`. |
| `index.css` | 1 | Remove `.focus-ds`, `.ref-code`, `.editable-text` blocks. |
| `ui/sidebar.jsx` | -1 | Delete. |
| ~50 component+page files | ~50 | Mechanical sweep — remove `focus-ds` from className strings. |

**Total:** ~10 logic + ~50 mechanical = ~60 modified + 2 created + 1 deleted.

---

## 6. Stages

3 stages, sequential. Each = one commit. Squash-merge PR at end.

### Stage 1 — `<SearchInput>` extract + integrate

- Create `SearchInput.jsx` + test.
- Update `index.js` re-exports.
- Replace local `SearchInput` helper в Clients/Teams/Tasks pages с `import { SearchInput } from '../components/shell/index.js'` + use as `<SearchInput placeholder=... value={search} onChange={setSearch} ariaLabel=... />`.
- Drop the local helper from each page.
- Verify: tests pass (196 baseline + ~3 new = ~199), build clean.

**Deliverable:** ~5-6 file changes, 1 commit.

### Stage 2 — Outlet context unification + aria-labels

- Update `MasterDetailLayout.jsx` to accept `listLabel`/`detailLabel` optional props.
- Update `MasterDetailLayout.test.jsx` with label rendering tests.
- Update each master-detail page:
  - Drop `callerId`, `user` (Teams/Tasks) from `<Outlet context>`.
  - In `*DetailRoute`: read `useAuth()`, derive `callerId = user?.id`, pass user/callerId to DetailPanel as props (no DetailPanel internal changes).
  - Pass `listLabel` + `detailLabel` to `<MasterDetailLayout>`.
- Verify: tests pass, build clean. Visual smoke if possible.

**Deliverable:** ~6 file changes, 1 commit.

### Stage 3 — Dead-code sweep + push + PR

- Mechanical sweep: `grep -rln "focus-ds" src/components/ src/pages/ src/LoginPage.jsx`. For each file, remove `focus-ds` from className strings (typically `className="... focus-ds ..."` → `className="..."` with whitespace fix).
- Edit `src/index.css`: remove `.focus-ds`, `.ref-code`, `.editable-text` blocks (in `@layer components` section).
- Delete `src/components/ui/sidebar.jsx`.
- Final smoke: `npm test -- --run` (still ~199), `npx vite build` clean, browser smoke for focus rings (universal rule still works).
- Commit + push + open PR.

**Deliverable:** ~50 file changes (mostly mechanical), 1 commit, PR.

---

## 7. Тестирование

### 7.1. Existing tests

196 baseline must continue passing. Specifically:
- Shell tests (`AppShell`, `RailNav`, `AppHeader`, `UserMenuDropdown`, `MasterDetailLayout`, `ListPane`, `UserMenuDropdown`) — none assert outlet context shape internally; should pass unchanged.
- Page-component sub-tests (`ClientList`, `TeamList`, etc.) — none touch outlet context or focus-ds; should pass.
- Hook/lib tests — no surface; should pass.

### 7.2. New tests

| File | Что тестируется |
|---|---|
| `SearchInput.test.jsx` | Renders `<input type="search">` with placeholder + ariaLabel + value; onChange callback fires with new value. ~3 assertions. |
| `MasterDetailLayout.test.jsx` (extension) | Renders `aria-label` on aside/section when `listLabel`/`detailLabel` provided; omits attribute when undefined. ~2 assertions. |

**Target test count:** 196 (existing) + ~5 (new) = **~201 total**.

### 7.3. Visual smoke (if dev server available)

- All routes: focus rings still visible on rail icons / nav links / inputs / buttons (universal `:focus-visible` rule unchanged from Subplan 6).
- Master-detail pages: list pane + main render correctly with new outlet context shape.
- Tab through interactive elements: focus indication everywhere.
- Light + dark mode: visual integrity.

### 7.4. Что НЕ тестируем

- aria-label screen-reader pronunciation (would need actual screen reader testing — out of scope).
- Pixel-perfect anything (no visual changes intended in 6A2).
- E2E flows (no behavior change).

---

## 8. Acceptance criteria

After all 3 stages merged into `main`:

- `src/components/shell/SearchInput.jsx` + `.test.jsx` exist; `index.js` re-exports.
- `src/components/shell/MasterDetailLayout.jsx` accepts optional `listLabel`/`detailLabel` props; tests cover both.
- 3 master-detail pages use shell `<SearchInput>` (zero local SearchInput helpers remain).
- Outlet context shape:
  - Clients = `{rows, reload}`
  - Teams = `{rows, reload}`
  - Tasks = `{rows, reload, box, basePath}`
  - Zero `user`/`callerId` in context — `*DetailRoute` reads `useAuth()` сам.
- Master-detail pages pass `listLabel` + `detailLabel` props to `<MasterDetailLayout>`.
- Zero `.focus-ds` usages в `src/`:
  ```bash
  grep -rE "focus-ds" src/ --include="*.jsx" --include="*.js" --include="*.css"
  ```
  Expected: zero matches.
- Zero `.ref-code` / `.editable-text` definitions в `src/index.css` (already 0 usages elsewhere).
- `src/components/ui/sidebar.jsx` deleted.
- `npm test -- --run` passes (~201 tests).
- `npx vite build` clean (only pre-existing chunk-size warning).
- Visual smoke through 7 routes works в light + dark; focus rings everywhere.

---

## 9. Файлы для контекста

При начале plan'а / implementation'а:

- This spec.
- [Subplan 6A spec](2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — outlet context shapes, MasterDetailLayout original contract.
- [Subplan 6A plan](../plans/2026-04-26-crm-subplan-6a-shell-rebuild.md) — execution patterns reference.
- [Subplan 6 Foundation spec](2026-04-26-crm-subplan-6-design-system-foundation-design.md) — universal `:focus-visible` rule definition.
- `src/components/shell/{MasterDetailLayout,index}.{jsx,js}` — files to extend.
- `src/components/shell/MasterDetailLayout.test.jsx` — tests to extend.
- `src/pages/{ClientList,TeamList,TaskList}Page.jsx` — current 3 master-detail pages, contain local SearchInput helpers + outlet context calls.
- `src/index.css` — `.focus-ds` / `.ref-code` / `.editable-text` definitions (in `@layer components`).
- `src/components/ui/sidebar.jsx` — file to delete.
- `src/useAuth.jsx` — `useAuth` hook DetailRoute will use.
