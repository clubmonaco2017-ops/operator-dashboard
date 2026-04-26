# CRM Subplan 6A2 — Handoff & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Закрыть 6A code-review handoff debts (extract `<SearchInput>`, unify outlet context, add aria-labels) + dead-code cleanup (sweep `.focus-ds` redundant after universal `:focus-visible`, delete unused `ui/sidebar.jsx`, remove unused `.ref-code`/`.editable-text` utility classes). Mini-PR без визуального repaint.

**Architecture:** Three sequential stages on single branch `feat/subplan-6a2-handoff-cleanup`. Stage 1: extract shared `<SearchInput>` shell component, replace 3 local copies. Stage 2: extend `<MasterDetailLayout>` with optional aria-label props, refactor outlet context shape from `{rows, reload, callerId, user}` to `{rows, reload}` + page-extras (`box`, `basePath` for Tasks); `*DetailRoute` components read `useAuth()` themselves. Stage 3: mechanical sweep of 40 files removing `.focus-ds` class, remove redundant CSS definitions, delete unused shadcn primitive.

**Tech Stack:** React 19, react-router-dom v7 (`useOutletContext`, `useAuth`), Tailwind CSS v4, lucide-react (`Search`), Vitest + @testing-library/react.

**Source of truth:**
- [Subplan 6A2 spec](../specs/2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — all decisions D-1…D-6, contracts, per-page summary, acceptance.
- [Subplan 6A spec](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — original outlet context shapes, MasterDetailLayout original contract.
- [Subplan 6A plan](2026-04-26-crm-subplan-6a-shell-rebuild.md) — execution patterns reference (similar 5-stage shape).

**Prerequisites:**
- Subplans 6 + 6A merged into `main` ✓ (latest commit on main: `8d878ec`).
- Spec for 6A2 committed (`3561b6c`) on main.
- All 196 baseline tests passing on `main`.
- 40 production files contain `focus-ds` class usage (verified via `grep -rln "focus-ds" src/components/ src/pages/ src/LoginPage.jsx`).
- `src/index.css` definitions at lines 415 (`.ref-code`), 493 (`.focus-ds`), 499 (`.editable-text`).
- Universal `:where(button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])):focus-visible` rule in place from Subplan 6 Stage 1.

---

## File structure

### Create

```
src/components/shell/SearchInput.jsx          # extracted shell component
src/components/shell/SearchInput.test.jsx     # contract tests (~3 assertions)
```

### Modify (logic — Stages 1-2)

```
src/components/shell/MasterDetailLayout.jsx       # add listLabel/detailLabel optional props
src/components/shell/MasterDetailLayout.test.jsx  # test new optional props
src/components/shell/index.js                     # export SearchInput
src/pages/ClientListPage.jsx                      # use SearchInput; outlet context = {rows, reload}; ClientDetailRoute reads useAuth()
src/pages/TeamListPage.jsx                        # same pattern
src/pages/TaskListPage.jsx                        # same + retain box/basePath
```

### Modify (mechanical sweep — Stage 3)

```
src/index.css                                     # remove .focus-ds, .ref-code, .editable-text definitions
40 files containing "focus-ds" class:
  src/components/clients/ActivityCard.jsx, BulkActionBar.jsx, ClientDetailPanel.jsx,
    ClientFilterChips.jsx, ClientListItem.jsx, CreateClientCloseConfirm.jsx,
    CreateClientSlideOut.jsx, PhotoGalleryTab.jsx, ProfileTab.jsx, SummaryCard.jsx,
    VideoGalleryTab.jsx
  src/components/shell/RailNav.jsx, UserMenuDropdown.jsx
  src/components/staff/AddCuratedOperatorsModal.jsx, ChangeCuratorModal.jsx,
    ChangeTeamModal.jsx, CuratedOperatorsBlock.jsx, CuratorBlock.jsx,
    TeamMembershipBlock.jsx
  src/components/tasks/AssigneeSelector.jsx, CreateTaskSlideOut.jsx, TaskBoxTabs.jsx,
    TaskDescriptionCard.jsx, TaskDetailPanel.jsx, TaskFieldsCard.jsx,
    TaskFilterChips.jsx, TaskListItem.jsx, TaskReportCard.jsx
  src/components/teams/AddClientsModal.jsx, AddMemberModal.jsx, ChangeLeadModal.jsx,
    CreateTeamSlideOut.jsx, TeamClientsTab.jsx, TeamDetailPanel.jsx,
    TeamFilterChips.jsx, TeamListItem.jsx, TeamMembersTab.jsx
  src/pages/ClientListPage.jsx, TaskListPage.jsx, TeamListPage.jsx
```

### Delete

```
src/components/ui/sidebar.jsx                     # 669 lines, 0 production usage
```

### NOT touched

- `src/AdminLayout.jsx` (legacy, Subplan 7)
- `src/LoginPage.jsx` (no `.focus-ds` here per grep — outside list above)
- DB / migrations / hooks / lib — zero changes
- All other shadcn primitives in `src/components/ui/` — only sidebar.jsx removed
- `TeamDetailPanel` / `TaskDetailPanel` internals — unchanged (still take `user` as prop; refactor deferred to 6A4 or 7)

---

## Stages

3 stages, sequential. Each = one commit. Squash-merge PR at end.

---

### Stage 1 — `<SearchInput>` extract + integrate

**Цель:** Create shell `<SearchInput>` component with tests; replace 3 local SearchInput helpers in master-detail pages with shell import.

#### Task 1.1 — Branch + baseline verification

**Files:**
- Create: branch `feat/subplan-6a2-handoff-cleanup` from `main` (`3561b6c` after spec commit)

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git checkout main
git pull --ff-only
git checkout -b feat/subplan-6a2-handoff-cleanup
git status
```
Expected: clean, ahead 0.

- [ ] **Step 2: Verify baseline**

```bash
npm test -- --run
```
Expected: 196 passed (20 files). Note exact count for end-of-stage comparison.

```bash
npx vite build
```
Expected: clean, only pre-existing chunk-size warning.

#### Task 1.2 — `<SearchInput>` component + test (TDD)

**Files:**
- Create: `src/components/shell/SearchInput.jsx`
- Create: `src/components/shell/SearchInput.test.jsx`

- [ ] **Step 1: Write the failing test**

Write to `src/components/shell/SearchInput.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchInput } from './SearchInput.jsx'

describe('<SearchInput>', () => {
  it('renders search input with placeholder, value, and aria-label', () => {
    render(
      <SearchInput
        placeholder="Поиск клиентов"
        value="абв"
        onChange={() => {}}
        ariaLabel="Поиск по клиентам"
      />,
    )
    const input = screen.getByRole('searchbox', { name: 'Поиск по клиентам' })
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Поиск клиентов')
    expect(input).toHaveValue('абв')
  })

  it('calls onChange with the new value when user types', () => {
    const onChange = vi.fn()
    render(
      <SearchInput
        placeholder="Поиск"
        value=""
        onChange={onChange}
        ariaLabel="Поиск"
      />,
    )
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'тест' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('тест')
  })

  it('renders the lucide Search icon (decorative)', () => {
    const { container } = render(
      <SearchInput placeholder="P" value="" onChange={() => {}} ariaLabel="A" />,
    )
    // Lucide renders an <svg>; the icon has aria-hidden set
    const svg = container.querySelector('svg[aria-hidden]')
    expect(svg).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --run src/components/shell/SearchInput.test.jsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Write to `src/components/shell/SearchInput.jsx`:

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

(Note: NO `.focus-ds` class — universal `:focus-visible` rule covers `<input>` from Subplan 6.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run src/components/shell/SearchInput.test.jsx
```
Expected: PASS (3 tests).

#### Task 1.3 — Update `index.js` to export SearchInput

**Files:**
- Modify: `src/components/shell/index.js`

- [ ] **Step 1: Read current index.js**

```bash
cat src/components/shell/index.js
```
Expected: 6 existing exports (AppShell, RailNav, AppHeader+useDerivedBreadcrumb, UserMenuDropdown, MasterDetailLayout, ListPane).

- [ ] **Step 2: Add SearchInput export**

Add the following line to `src/components/shell/index.js` (consistent placement with other exports, e.g., after `ListPane`):

```js
export { SearchInput } from './SearchInput.jsx'
```

- [ ] **Step 3: Verify**

```bash
npm test -- --run
```
Expected: 196 (existing) + 3 (new SearchInput tests) = **199 passed**.

```bash
npx vite build
```
Expected: clean.

#### Task 1.4 — Replace local SearchInput in `ClientListPage.jsx`

**Files:**
- Modify: `src/pages/ClientListPage.jsx`

- [ ] **Step 1: Inspect current SearchInput helper at bottom of file**

```bash
grep -n "function SearchInput\|searchNode\|SearchInput value" src/pages/ClientListPage.jsx
```
Expected: shows the local `function SearchInput({...})` at the bottom + a usage like `searchNode = <SearchInput value={search} onChange={setSearch} />`.

- [ ] **Step 2: Update import to include shell SearchInput**

Find the existing import line:
```jsx
import { MasterDetailLayout, ListPane } from '../components/shell/index.js'
```
Change to:
```jsx
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
```

- [ ] **Step 3: Remove `Search` icon import (no longer needed at page level)**

If page imports `Search` from `lucide-react` ONLY for the local SearchInput helper, remove that import:
```jsx
import { Search } from 'lucide-react'   // REMOVE if only used by SearchInput
```
(If `Search` is used elsewhere in the file, keep it. Verify with `grep "Search" src/pages/ClientListPage.jsx`.)

- [ ] **Step 4: Update searchNode JSX to pass new props**

Locate the line that defines `searchNode`. It currently looks like:
```jsx
const searchNode = <SearchInput value={search} onChange={setSearch} />
```

Change to (with explicit ariaLabel):
```jsx
const searchNode = (
  <SearchInput
    placeholder="Поиск по name / alias…"
    value={search}
    onChange={setSearch}
    ariaLabel="Поиск клиентов"
  />
)
```

- [ ] **Step 5: Delete the local `function SearchInput(...)` definition at bottom of file**

Find and delete the entire `function SearchInput({ value, onChange }) { ... }` block (typically the last function in the file, ~17 lines).

- [ ] **Step 6: Verify**

```bash
npm test -- --run
npx vite build
```
Expected: 199 still passing, build clean.

#### Task 1.5 — Replace local SearchInput in `TeamListPage.jsx`

**Files:**
- Modify: `src/pages/TeamListPage.jsx`

- [ ] **Step 1: Apply same 4-step pattern as Task 1.4**

1. Add `SearchInput` to existing shell import.
2. Remove `Search` lucide import if no other usage.
3. Update `searchNode` to:
   ```jsx
   const searchNode = (
     <SearchInput
       placeholder="Поиск команд…"
       value={search}
       onChange={setSearch}
       ariaLabel="Поиск команд"
     />
   )
   ```
   (Adjust placeholder to match what TeamListPage's local SearchInput originally used — check before changing.)
4. Delete local `function SearchInput(...)` block.

- [ ] **Step 2: Verify**

```bash
npm test -- --run && npx vite build
```
Expected: 201, clean.

#### Task 1.6 — Replace local SearchInput in `TaskListPage.jsx`

**Files:**
- Modify: `src/pages/TaskListPage.jsx`

- [ ] **Step 1: Apply same pattern**

Update `searchNode` placeholder to match TaskListPage's existing one (e.g., `"Поиск задач…"`); ariaLabel `"Поиск задач"`.

- [ ] **Step 2: Verify**

```bash
npm test -- --run && npx vite build
```
Expected: 201, clean.

#### Task 1.7 — Stage 1 commit

- [ ] **Step 1: Final test + build**

```bash
npm test -- --run
npx vite build
```
Expected: 199 passed, build clean.

- [ ] **Step 2: Stage and commit**

```bash
git add src/components/shell/SearchInput.jsx src/components/shell/SearchInput.test.jsx src/components/shell/index.js src/pages/ClientListPage.jsx src/pages/TeamListPage.jsx src/pages/TaskListPage.jsx
git status   # confirm only these files staged
git commit -m "feat(shell): extract <SearchInput> + replace 3 local copies (Subplan 6A2 Stage 1)

- New src/components/shell/SearchInput.jsx with contract test (3 assertions).
- API: { placeholder, value, onChange, ariaLabel }. No kbd indicator
  (defer to whenever real keyboard handler appears). No focus-ds class
  (universal :focus-visible covers <input> from Subplan 6).
- ClientListPage / TeamListPage / TaskListPage now import shell SearchInput;
  local function SearchInput definitions deleted from each page.
- Per-page placeholder + ariaLabel props supplied for a11y."
```

- [ ] **Step 3: Verify**

```bash
git log -1 --stat
```
Expected: 6 files modified (1 new + 1 new test + 1 modified index + 3 modified pages).

**Definition of done — Stage 1:**
- `<SearchInput>` exists in shell with tests
- 3 master-detail pages import shell SearchInput; zero local SearchInput helpers remain
- 199 tests pass, build clean
- 1 commit

---

### Stage 2 — Outlet context unification + aria-labels

**Цель:** Update `MasterDetailLayout` to accept optional aria-label props; refactor 3 master-detail pages to drop `user`/`callerId` from outlet context (DetailRoute reads `useAuth()` itself).

#### Task 2.1 — Update `<MasterDetailLayout>` with optional aria-label props

**Files:**
- Modify: `src/components/shell/MasterDetailLayout.jsx`
- Modify: `src/components/shell/MasterDetailLayout.test.jsx`

- [ ] **Step 1: Read current MasterDetailLayout**

```bash
cat src/components/shell/MasterDetailLayout.jsx
```
Expected: small file with `function MasterDetailLayout({ listPane, children })` and grid `[320px_1fr]`.

- [ ] **Step 2: Update implementation**

Replace contents of `src/components/shell/MasterDetailLayout.jsx`:

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

(`aria-label={undefined}` — React omits the attribute, so no regression for callers that don't pass labels.)

- [ ] **Step 3: Add tests for new props**

Append to `src/components/shell/MasterDetailLayout.test.jsx` (within the existing `describe('<MasterDetailLayout>', ...)` block):

```jsx
  it('renders aria-label on aside and section when listLabel/detailLabel provided', () => {
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp" />}
        listLabel="Список клиентов"
        detailLabel="Профиль клиента"
      >
        <div data-testid="main" />
      </MasterDetailLayout>,
    )
    expect(screen.getByLabelText('Список клиентов').tagName).toBe('ASIDE')
    expect(screen.getByLabelText('Профиль клиента').tagName).toBe('SECTION')
  })

  it('omits aria-label attribute when labels are undefined', () => {
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    expect(container.querySelector('aside')).not.toHaveAttribute('aria-label')
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label')
  })
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/components/shell/MasterDetailLayout.test.jsx
```
Expected: 4 tests pass (2 existing + 2 new).

#### Task 2.2 — Refactor `ClientListPage.jsx` outlet context + DetailRoute

**Files:**
- Modify: `src/pages/ClientListPage.jsx`

- [ ] **Step 1: Update `<MasterDetailLayout>` JSX with aria-labels**

Find the `<MasterDetailLayout listPane={...}>` JSX. Add `listLabel="Список клиентов"` + `detailLabel="Профиль клиента"`:

```jsx
<MasterDetailLayout
  listPane={...}
  listLabel="Список клиентов"
  detailLabel="Профиль клиента"
>
  <Outlet context={...} />
</MasterDetailLayout>
```

- [ ] **Step 2: Drop `callerId` from outlet context**

Find the line:
```jsx
<Outlet context={{ rows, reload, callerId: user?.id }} />
```
Change to:
```jsx
<Outlet context={{ rows, reload }} />
```

- [ ] **Step 3: Update `ClientDetailRoute` to read useAuth()**

Find the existing `ClientDetailRoute` named export. Currently:

```jsx
export function ClientDetailRoute() {
  const { clientId, tab } = useParams()
  const { rows, reload, callerId } = useOutletContext()
  return (
    <ClientDetailPanel
      callerId={callerId}
      clientId={clientId}
      activeTab={tab || 'profile'}
      siblings={rows}
      onChanged={reload}
    />
  )
}
```

Replace with:

```jsx
export function ClientDetailRoute() {
  const { user } = useAuth()
  const { clientId, tab } = useParams()
  const { rows, reload } = useOutletContext()
  return (
    <ClientDetailPanel
      callerId={user?.id}
      clientId={clientId}
      activeTab={tab || 'profile'}
      siblings={rows}
      onChanged={reload}
    />
  )
}
```

(`useAuth` is already imported at top of the file — verify with `grep "useAuth" src/pages/ClientListPage.jsx`. If missing, add: `import { useAuth } from '../useAuth.jsx'`.)

- [ ] **Step 4: Verify**

```bash
npm test -- --run && npx vite build
```
Expected: 201, clean.

#### Task 2.3 — Refactor `TeamListPage.jsx` outlet context + DetailRoute

**Files:**
- Modify: `src/pages/TeamListPage.jsx`

- [ ] **Step 1: Update `<MasterDetailLayout>` JSX with aria-labels**

Add `listLabel="Список команд"` + `detailLabel="Команда"` to MasterDetailLayout JSX.

- [ ] **Step 2: Drop `callerId` and `user` from outlet context**

Find current outlet context (likely):
```jsx
<Outlet context={{ rows, reload, callerId: user?.id, user }} />
```
Change to:
```jsx
<Outlet context={{ rows, reload }} />
```

- [ ] **Step 3: Update `TeamDetailRoute` to read useAuth()**

Find current implementation (mirrors Clients pattern but takes `user` from context):

```jsx
export function TeamDetailRoute() {
  const { teamId } = useParams()
  const { rows, reload, callerId, user } = useOutletContext()
  const navigate = useNavigate()
  return (
    <TeamDetailPanel
      callerId={callerId}
      user={user}
      teamId={Number(teamId)}
      siblings={rows}
      onChanged={reload}
      onBack={() => navigate('/teams')}
    />
  )
}
```

Replace with:

```jsx
export function TeamDetailRoute() {
  const { user } = useAuth()
  const { teamId } = useParams()
  const { rows, reload } = useOutletContext()
  const navigate = useNavigate()
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
}
```

(Verify `useAuth` and `useNavigate` imports already exist at top of file. `useNavigate` already used by parent for create-flow routing.)

- [ ] **Step 4: Verify**

```bash
npm test -- --run && npx vite build
```
Expected: 201, clean.

#### Task 2.4 — Refactor `TaskListPage.jsx` outlet context + DetailRoute

**Files:**
- Modify: `src/pages/TaskListPage.jsx`

- [ ] **Step 1: Update `<MasterDetailLayout>` JSX with aria-labels**

Add `listLabel="Список задач"` + `detailLabel="Задача"` to MasterDetailLayout JSX.

- [ ] **Step 2: Drop `callerId` and `user` from outlet context (KEEP box, basePath)**

Find current outlet context:
```jsx
<Outlet context={{ rows: displayRows, reload, callerId: user?.id, user, box, basePath }} />
```
Change to:
```jsx
<Outlet context={{ rows: displayRows, reload, box, basePath }} />
```

(Note: `box` and `basePath` STAY because they're page-specific extras computed by parent from URL pathname.)

- [ ] **Step 3: Update `TaskDetailRoute` to read useAuth()**

Find current implementation:

```jsx
export function TaskDetailRoute() {
  const { taskId } = useParams()
  const { rows, reload, callerId, user, basePath } = useOutletContext()
  const navigate = useNavigate()
  return (
    <TaskDetailPanel
      callerId={callerId}
      user={user}
      taskId={Number(taskId)}
      siblings={rows}
      onChanged={reload}
      onBack={() => navigate(basePath)}
      onDeleted={() => navigate(basePath)}
    />
  )
}
```

Replace with:

```jsx
export function TaskDetailRoute() {
  const { user } = useAuth()
  const { taskId } = useParams()
  const { rows, reload, basePath } = useOutletContext()
  const navigate = useNavigate()
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
}
```

- [ ] **Step 4: Verify**

```bash
npm test -- --run && npx vite build
```
Expected: 201, clean.

#### Task 2.5 — Stage 2 commit

- [ ] **Step 1: Final test + build**

```bash
npm test -- --run
npx vite build
```
Expected: 201 passed (199 + 2 new MasterDetailLayout tests), build clean.

- [ ] **Step 2: Stage and commit**

```bash
git add src/components/shell/MasterDetailLayout.jsx src/components/shell/MasterDetailLayout.test.jsx src/pages/ClientListPage.jsx src/pages/TeamListPage.jsx src/pages/TaskListPage.jsx
git status   # confirm only these 5 files staged
git commit -m "feat(shell): unify outlet context + add aria-labels to MasterDetailLayout (Subplan 6A2 Stage 2)

- MasterDetailLayout accepts optional listLabel/detailLabel props →
  aria-label on aside/section. Two new tests (4 total).
- Outlet context shape unified:
    Clients = {rows, reload}
    Teams   = {rows, reload}
    Tasks   = {rows, reload, box, basePath}
  Dropped callerId/user from context — *DetailRoute components now read
  useAuth() themselves and pass props to DetailPanel as before.
  Detail panels (ClientDetailPanel, TeamDetailPanel, TaskDetailPanel)
  internals unchanged — same prop signatures.
- Each master-detail page passes meaningful listLabel/detailLabel to
  MasterDetailLayout (Список клиентов / Профиль клиента, Список команд /
  Команда, Список задач / Задача)."
```

**Definition of done — Stage 2:**
- MasterDetailLayout has optional aria-label props with tests
- 3 master-detail pages drop `user`/`callerId` from outlet context
- 3 *DetailRoute components read useAuth() instead
- 201 tests pass, build clean
- 1 commit

---

### Stage 3 — Dead-code sweep + push + PR

**Цель:** Remove `.focus-ds` class from 40 production files; remove redundant CSS definitions; delete unused shadcn primitive.

#### Task 3.1 — Sweep `.focus-ds` from JSX (40 files)

**Files:**
- Modify: 40 files containing `focus-ds` class

**Pattern:** find each `className="... focus-ds ..."` instance and remove `focus-ds` from the string. Adjust whitespace so resulting className is clean (no leading/trailing/double spaces).

**Examples of expected transforms:**

```jsx
// Before:
className="rounded-md bg-card focus-ds"
// After:
className="rounded-md bg-card"

// Before:
className="focus-ds px-3 py-2"
// After:
className="px-3 py-2"

// Before (template literal):
className={`rounded-lg ${active ? 'bg-primary' : ''} focus-ds`}
// After:
className={`rounded-lg ${active ? 'bg-primary' : ''}`}

// Before (multi-class with conditional):
className={({ isActive }) => `... transition-colors focus-ds ${isActive ? '...' : '...'}`}
// After:
className={({ isActive }) => `... transition-colors ${isActive ? '...' : '...'}`}
```

- [ ] **Step 1: Generate authoritative list**

```bash
grep -rln "focus-ds" src/components/ src/pages/ src/LoginPage.jsx 2>/dev/null | sort
```
Expected: 40 files (per spec authority count).

- [ ] **Step 2: For each of the 40 files, remove `focus-ds` from className strings**

For each file, use `grep -n "focus-ds" <file>` to locate every occurrence, then edit to remove the class. Preserve all other classes and conditional logic.

Files to process (group by folder for efficiency):

**`src/components/clients/` (11 files):** ActivityCard.jsx, BulkActionBar.jsx, ClientDetailPanel.jsx, ClientFilterChips.jsx, ClientListItem.jsx, CreateClientCloseConfirm.jsx, CreateClientSlideOut.jsx, PhotoGalleryTab.jsx, ProfileTab.jsx, SummaryCard.jsx, VideoGalleryTab.jsx

**`src/components/shell/` (2 files):** RailNav.jsx, UserMenuDropdown.jsx

**`src/components/staff/` (6 files):** AddCuratedOperatorsModal.jsx, ChangeCuratorModal.jsx, ChangeTeamModal.jsx, CuratedOperatorsBlock.jsx, CuratorBlock.jsx, TeamMembershipBlock.jsx

**`src/components/tasks/` (9 files):** AssigneeSelector.jsx, CreateTaskSlideOut.jsx, TaskBoxTabs.jsx, TaskDescriptionCard.jsx, TaskDetailPanel.jsx, TaskFieldsCard.jsx, TaskFilterChips.jsx, TaskListItem.jsx, TaskReportCard.jsx

**`src/components/teams/` (9 files):** AddClientsModal.jsx, AddMemberModal.jsx, ChangeLeadModal.jsx, CreateTeamSlideOut.jsx, TeamClientsTab.jsx, TeamDetailPanel.jsx, TeamFilterChips.jsx, TeamListItem.jsx, TeamMembersTab.jsx

**`src/pages/` (3 files):** ClientListPage.jsx, TaskListPage.jsx, TeamListPage.jsx

(Note: ClientListPage/TaskListPage/TeamListPage may have already been touched in Stages 1-2; this is only the focus-ds sweep on those same files.)

- [ ] **Step 3: Verify zero remaining usages**

```bash
grep -rn "focus-ds" src/ --include="*.jsx" --include="*.js"
```
Expected: ZERO matches.

- [ ] **Step 4: Run tests + build**

```bash
npm test -- --run
npx vite build
```
Expected: 201 passed, clean. (No tests assert focus-ds class presence.)

#### Task 3.2 — Remove `.focus-ds`, `.ref-code`, `.editable-text` from `src/index.css`

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Read the current `@layer components` block in index.css**

```bash
sed -n '410,505p' src/index.css
```
Expected output: `.ref-code` definition around line 415, `.focus-ds:focus-visible` around line 493, `.editable-text:hover` around line 499.

- [ ] **Step 2: Remove `.ref-code` block** (around line 415)

Find:
```css
  .ref-code {
    font-family: var(--font-mono);
    font-size: 11.5px;
    letter-spacing: 0.02em;
    color: var(--fg3);
    white-space: nowrap;
  }
```

Delete entirely (the block + any blank line above/below if it leaves orphan whitespace).

- [ ] **Step 3: Remove `.focus-ds:focus-visible` block** (around line 493)

Find:
```css
  /* --- Focus ring helper --- */
  .focus-ds:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
```

Delete entirely (including the comment line `/* --- Focus ring helper --- */`).

- [ ] **Step 4: Remove `.editable-text:hover` block** (around line 499)

Find:
```css
  /* --- Subtle cursor change for editable plain-text fields (R2.2) --- */
  .editable-text:hover { cursor: text; }
```

Delete entirely (including the comment line).

- [ ] **Step 5: Verify CSS still parses**

```bash
npx vite build
```
Expected: clean build. CSS bundle size will decrease slightly (~200 bytes).

- [ ] **Step 6: Verify no other CSS references**

```bash
grep -n "focus-ds\|ref-code\|editable-text" src/index.css
```
Expected: ZERO matches.

#### Task 3.3 — Delete `src/components/ui/sidebar.jsx`

**Files:**
- Delete: `src/components/ui/sidebar.jsx`

- [ ] **Step 1: Confirm zero usage one more time**

```bash
grep -rn "from.*ui/sidebar\|from '@/components/ui/sidebar'" src/ --include="*.jsx" --include="*.js"
```
Expected: ZERO matches.

If any match — STOP and investigate. Do not delete.

- [ ] **Step 2: Delete file**

```bash
git rm src/components/ui/sidebar.jsx
```

- [ ] **Step 3: Verify build still clean**

```bash
npx vite build
```
Expected: clean (no broken imports).

#### Task 3.4 — Final verification + commit + push + PR

- [ ] **Step 1: Run full suite + build**

```bash
npm test -- --run
npx vite build
```
Expected: 201 passed, clean.

- [ ] **Step 2: Final smoke (if dev server available)**

```bash
npm run dev
```

Open in browser:
- `/` Dashboard — focus rings still visible on rail icons / nav links / inputs / buttons (universal `:focus-visible` rule unchanged from Subplan 6).
- `/clients`, `/teams`, `/tasks` — list pane + main render. Click into a row → detail panel. SearchInput works. Tab through interactive elements: focus rings everywhere.
- Toggle dark mode (`document.documentElement.classList.toggle('dark')` in DevTools console) — visual integrity preserved.
- Stop dev server.

- [ ] **Step 3: Stage and commit Stage 3**

```bash
git status   # should show: src/index.css modified, ui/sidebar.jsx deleted, 40 *.jsx files modified
git add -A   # stages all sweep + cleanup
git status   # confirm
git commit -m "chore(shell): sweep .focus-ds + delete unused css/components (Subplan 6A2 Stage 3)

- Remove .focus-ds class from 40 production files (universal
  :where(button, a, input, ...):focus-visible rule from Subplan 6 Stage 1
  fully covers all interactive elements; .focus-ds was redundant).
- Remove .focus-ds, .ref-code, .editable-text definitions from
  src/index.css (.ref-code and .editable-text had 0 production usages).
- Delete src/components/ui/sidebar.jsx (669-line shadcn primitive bundled
  with application-shell7; never integrated into Subplan 6A shell or any
  page; safe to remove)."
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/subplan-6a2-handoff-cleanup
```

If push fails because branch exists on origin: `git fetch && git log feat/subplan-6a2-handoff-cleanup..origin/feat/subplan-6a2-handoff-cleanup`. If remote has commits not local — STOP. If local ahead and remote unchanged — `git push --force-with-lease` ONLY after user confirmation. Default: report and ask.

- [ ] **Step 5: Open PR**

```bash
gh pr create --base main --title "feat(shell): Subplan 6A2 — handoff cleanup (SearchInput extract + outlet context + .focus-ds sweep)" --body "$(cat <<'EOF'
## Summary

Mini-PR closing 6A code-review handoff debts + dead-code cleanup. No visual repaint.

1. **Stage 1 (SearchInput extract)** — new \`src/components/shell/SearchInput.jsx\` + tests; replaced 3 local copies in Clients/Teams/Tasks pages.
2. **Stage 2 (outlet context + aria-labels)** — \`MasterDetailLayout\` accepts optional \`listLabel\`/\`detailLabel\` props (→ aria-label on aside/section). Outlet context unified: \`{rows, reload}\` + page-extras (\`box, basePath\` for Tasks); dropped \`user\`/\`callerId\`. \`*DetailRoute\` components now read \`useAuth()\` themselves.
3. **Stage 3 (cleanup)** — sweep \`.focus-ds\` class from 40 files (universal \`:focus-visible\` from Subplan 6 covers all interactive elements). Remove \`.focus-ds\`, \`.ref-code\`, \`.editable-text\` definitions from \`src/index.css\`. Delete \`src/components/ui/sidebar.jsx\` (0 production usage).

Spec: [docs/superpowers/specs/2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md](docs/superpowers/specs/2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md)
Plan: [docs/superpowers/plans/2026-04-26-crm-subplan-6a2-handoff-cleanup.md](docs/superpowers/plans/2026-04-26-crm-subplan-6a2-handoff-cleanup.md)

## Out of scope (deferred)

- Visual repaint of pages → Subplan 6A4
- Utility-class sweep (\`.btn-primary\`/\`.btn-ghost\`/\`.btn-danger-ghost\`/\`.surface-card\` → shadcn \`<Button>\`/\`<Card>\`) → 6A4
- DashboardPage rewrite + KpiCard refactor → 6A3
- TeamDetailPanel/TaskDetailPanel internal refactor (still take \`user\` prop) → 6A4 or Subplan 7
- Mobile shell → Subplan 6B
- AdminLayout cleanup → Subplan 7

## Test plan

- [ ] \`npm test\` — 201/201 passes (196 baseline + 3 SearchInput + 2 MasterDetailLayout extension)
- [ ] \`npx vite build\` — clean (only pre-existing chunk-size warning)
- [ ] \`grep -rn "focus-ds" src/ --include="*.jsx" --include="*.js" --include="*.css"\` returns ZERO matches
- [ ] All routes render with no console errors (\`/\`, \`/clients/*\`, \`/teams/*\`, \`/tasks/*\`, \`/staff/*\`, \`/notifications\`, \`/login\`)
- [ ] Focus rings still visible on rail icons / nav links / inputs / buttons (universal :focus-visible rule)
- [ ] Master-detail pages: aria-labels on landmarks (verify via screen reader or axe DevTools)
- [ ] SearchInput works in Clients/Teams/Tasks pages (typing updates list)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Capture PR URL**

Print the PR URL from `gh pr create` output. Report back.

**Definition of done — Stage 3:**
- Zero `.focus-ds` matches in `src/`
- `src/index.css` sans `.focus-ds`, `.ref-code`, `.editable-text` definitions
- `src/components/ui/sidebar.jsx` deleted
- 201 tests pass, build clean
- PR opened against main

---

## Acceptance criteria (post-merge — repeats spec §8)

After all 3 stages merged into `main`:

- `src/components/shell/SearchInput.jsx` + `SearchInput.test.jsx` exist; `index.js` re-exports.
- `src/components/shell/MasterDetailLayout.jsx` accepts optional `listLabel`/`detailLabel` props.
- 3 master-detail pages use shell `<SearchInput>` (zero local helpers remain).
- Outlet context shape:
  - Clients = `{rows, reload}`
  - Teams = `{rows, reload}`
  - Tasks = `{rows, reload, box, basePath}`
- `*DetailRoute` components read `useAuth()` themselves.
- Master-detail pages pass meaningful `listLabel`/`detailLabel` to `<MasterDetailLayout>`.
- Zero `.focus-ds`, `.ref-code`, `.editable-text` usages in `src/`:
  ```bash
  grep -rE "focus-ds|ref-code|editable-text" src/ --include="*.jsx" --include="*.js" --include="*.css"
  ```
  Expected: zero matches.
- `src/components/ui/sidebar.jsx` DELETED.
- `npm test -- --run` passes (~201 tests).
- `npx vite build` clean.

---

## Rollback / debugging notes

- **If `<Outlet context>` change breaks a detail panel:** verify the `*DetailRoute` destructures the right keys (Clients: `{rows, reload}`; Teams: `{rows, reload}`; Tasks: `{rows, reload, box, basePath}`). Common bug: leaving `callerId` in destructure when it's no longer in context (returns `undefined`).
- **If `useAuth()` hook returns `undefined`** (`*DetailRoute` after refactor): app likely had user logout in the middle of render. Defensive: pass `user?.id` not `user.id`.
- **If `.focus-ds` sweep breaks a focus visualization** for a non-interactive element with `tabindex` set: that's the universal rule's `:not([tabindex="-1"])` filter — only `tabindex="-1"` elements are excluded. If a `<div tabindex="0">` lost focus styling, it's actually covered by the universal rule. If lost styling on `<div>` without tabindex, that element wasn't supposed to be focusable in the first place.
- **If a CSS removal in `src/index.css` breaks build:** likely a dangling reference somewhere. Run `grep -rn "<class-name>" src/` after each removal — should be zero before deleting the definition.
- **If `git rm src/components/ui/sidebar.jsx` breaks build:** something imports from it. Re-run `grep -rn "from.*ui/sidebar" src/` and address before deleting.
- **If branch push fails because branch exists on origin:** `git fetch && git log feat/subplan-6a2-handoff-cleanup..origin/feat/subplan-6a2-handoff-cleanup`. Diverging — STOP, report. Local ahead — `git push --force-with-lease` ONLY after user confirms.
- **If `gh pr merge` fails with permissions:** switch gh account: `gh auth switch --user clubmonaco2017-ops` (per memory `project_gh_auth.md`).

---

## Files for context (reading order for a fresh implementer)

1. This plan.
2. [Subplan 6A2 spec](../specs/2026-04-26-crm-subplan-6a2-handoff-cleanup-design.md) — decisions log + contracts.
3. [Subplan 6A spec](../specs/2026-04-26-crm-subplan-6a-shell-rebuild-design.md) — original outlet context shapes, MasterDetailLayout original contract.
4. [Subplan 6 Foundation spec](../specs/2026-04-26-crm-subplan-6-design-system-foundation-design.md) — universal `:focus-visible` rule definition.
5. `src/components/shell/MasterDetailLayout.jsx` + `.test.jsx` — files to extend.
6. `src/components/shell/index.js` — barrel for new export.
7. `src/pages/{ClientList,TeamList,TaskList}Page.jsx` — current 3 master-detail pages (contain local SearchInput helpers + outlet context calls + `*DetailRoute` definitions).
8. `src/index.css` — `.focus-ds` (line ~493) / `.ref-code` (line ~415) / `.editable-text` (line ~499) definitions in `@layer components`.
9. `src/useAuth.jsx` — `useAuth` hook.
10. `src/components/PermissionGate.test.jsx` — sample test pattern (vitest + RTL).
