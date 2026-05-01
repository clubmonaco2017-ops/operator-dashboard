# Admin Section Redesign — Subplan 7-agencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `/admin/agencies` с table+drawer overlay на `MasterDetailLayout` + URL-tabs (Бренд / Контакты / Админы), с DS-перекраской и миграцией всех overlay'ев на shadcn `<Sheet>`/`<Dialog>`. Удалить 6 legacy файлов и переписать `AgencyDetailPanel` in-place.

**Architecture:** Новый `AgencyListPage` рендерит `MasterDetailLayout` с `ListPane` слева (search + chips + create button) и `<Outlet />` справа (для `AgencyDetailPanel`). Detail panel содержит header (name + platform + status + dropdown menu) + shadcn `<Tabs>` + `<Outlet />` для tab content. Тaba (`AgencyBrandingTab`, `AgencyContactsTab`, `AgencyAdminsTab`) — самодостаточные компоненты, использующие `useOutletContext()` для доступа к agency + reload. Сохранение в Branding/Contacts через `update_agency_branding` RPC с slice'ами (передаём NULL для не-этого-таба полей); в Admins — auto-save per checkbox через existing `assign_admin_to_agency` / `remove_admin_from_agency`. Никаких новых RPC.

**Tech Stack:** React 19 + Vite + Vitest + React Testing Library + Tailwind CSS v4 + shadcn/ui (`<Sheet>`, `<Dialog>`, `<Tabs>`, `<DropdownMenu>`, `<Badge>`, `<Avatar>`, `<Button>`, `<Card>`, `<Skeleton>`, `<Popover>`) + raw HTML inputs/selects/textareas/labels с Tailwind classes (matches codebase precedent в `CreateStaffSlideOut` / `CreateTeamSlideOut`) + lucide-react (`ArrowLeft`, `MoreVertical`, `X`, `Plus`, `Eye`/`EyeOff`, `Building2`, `Loader2`) + react-router-dom v6 (nested routes + Outlet + useNavigate + useLocation + useOutletContext) + Supabase RPC (`list_all_agencies`, `get_agency_full`, `create_agency`, `archive_agency`, `update_agency_branding`, `assign_admin_to_agency`, `remove_admin_from_agency`, `list_agency_admins`).

**Reference patterns (read before coding):**
- `src/pages/TeamListPage.jsx` — master-detail page shell (filter chips, search, create state, useTeamList, MasterDetailLayout)
- `src/components/teams/TeamListItem.jsx` — list item with avatar + counters + active accent bar
- `src/components/teams/TeamFilterChips.jsx` — chip toggle pattern
- `src/components/teams/CreateTeamSlideOut.jsx` — Sheet form with Cmd+Enter, error inline, native HTML inputs
- `src/components/teams/ArchiveTeamConfirmDialog.jsx` — Dialog confirm pattern
- `src/components/teams/TeamDetailPanel.jsx` — detail header + tabs + outlet
- `src/components/staff/CreateStaffSlideOut.jsx` — multi-select chip pattern (`MultiAgencyChips`)
- `src/components/admin-shell/AdminShell.jsx` — где менять `p-6` (сейчас на `<main>`)

**Spec:** [`docs/superpowers/specs/2026-05-01-admin-section-redesign-agencies-design.md`](../specs/2026-05-01-admin-section-redesign-agencies-design.md)

**Branching:** Feature branch `feat/subplan-7-agencies` off main. Worktree at `.claude/worktrees/feat-subplan-7-agencies`.

---

## File Structure

**Created (15 source files + 7 test files):**
- `src/hooks/useAgencyList.js`
- `src/hooks/useAgencyDetail.js`
- `src/pages/AgencyListPage.jsx`
- `src/pages/AgencyListPage.test.jsx`
- `src/components/agencies/AgencyList.jsx`
- `src/components/agencies/AgencyListItem.jsx`
- `src/components/agencies/AgencyFilterChips.jsx`
- `src/components/agencies/EmptyZero.jsx`
- `src/components/agencies/EmptyFilter.jsx`
- `src/components/agencies/DetailEmptyHint.jsx`
- `src/components/agencies/AgencyBrandingTab.jsx`
- `src/components/agencies/AgencyBrandingTab.test.jsx`
- `src/components/agencies/AgencyContactsTab.jsx`
- `src/components/agencies/AgencyContactsTab.test.jsx`
- `src/components/agencies/AgencyAdminsTab.jsx`
- `src/components/agencies/AgencyAdminsTab.test.jsx`
- `src/components/agencies/CreateAgencySlideOut.jsx`
- `src/components/agencies/CreateAgencySlideOut.test.jsx`
- `src/components/agencies/ArchiveAgencyDialog.jsx`
- `src/components/agencies/ArchiveAgencyDialog.test.jsx`
- `src/components/agencies/AgencyDetailPanel.test.jsx` (sibling to rewritten AgencyDetailPanel.jsx)

**Modified:**
- `src/components/agencies/AgencyDetailPanel.jsx` — rewritten in-place (180 LOC overlay → ~150 LOC nested-shell with header + tabs + outlet).
- `src/App.jsx` — заменить `<Route path="agencies/*" element={<AdminAgenciesPage />} />` на nested route block.
- `src/components/admin-shell/AdminShell.jsx` — убрать `p-6` с `<main>` (compensation fix from 7-shell больше не нужен).

**Deleted:**
- `src/pages/AdminAgenciesPage.jsx` (92 LOC)
- `src/components/agencies/AgencyTable.jsx` (74 LOC)
- `src/components/agencies/AgencyCreateModal.jsx` (145 LOC)
- `src/components/agencies/AgencyBrandingFields.jsx` (114 LOC)
- `src/components/agencies/AgencyContactsFields.jsx` (60 LOC)
- `src/components/agencies/AgencyAdminAssignments.jsx` (106 LOC)

---

## Task 0: Pre-flight & worktree

**Files:** none (read-only checks + branch setup)

- [ ] **Step 1: Verify clean main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git status
git log --oneline -3
```

Expected: clean working tree, top of log is `09afaa1` (merge of 7-shell PR #63).

- [ ] **Step 2: Create worktree + feature branch**

```bash
git worktree add .claude/worktrees/feat-subplan-7-agencies -b feat/subplan-7-agencies
cd .claude/worktrees/feat-subplan-7-agencies
cp /Users/artemsaskin/Work/operator-dashboard/.env.local .env.local
npm ci
```

Expected: worktree created, deps installed.

- [ ] **Step 3: Pre-flight grep — verify legacy file consumers**

```bash
grep -rn "AgencyTable\|AgencyCreateModal\|AgencyBrandingFields\|AgencyContactsFields\|AgencyAdminAssignments\|AdminAgenciesPage" src/ --include="*.jsx" --include="*.js"
```

Expected:
- `AgencyTable` — imported only by `src/pages/AdminAgenciesPage.jsx`
- `AgencyCreateModal` — imported only by `src/pages/AdminAgenciesPage.jsx`
- `AgencyBrandingFields` — imported only by `src/components/agencies/AgencyDetailPanel.jsx`
- `AgencyContactsFields` — imported only by `src/components/agencies/AgencyDetailPanel.jsx`
- `AgencyAdminAssignments` — imported only by `src/components/agencies/AgencyDetailPanel.jsx`
- `AdminAgenciesPage` — imported only by `src/App.jsx`

Если есть другие consumers — остановиться и обсудить.

- [ ] **Step 4: Baseline tests + build**

```bash
npm run test:run
npm run build
```

Expected baseline: те же 19 pre-existing failures (LoginPage 10 + UserMenuDropdown 4 + CreateStaffSlideOut 3 + AgencyFilterDropdown 1 + defaultPermissions 1) + 5 file-level crashes; **+5 AdminShell passes from 7-shell** (already in main since merge). Build clean.

После наших изменений набор failures должен остаться **тем же** — никаких новых регрессов.

---

## Task 1: Hooks — `useAgencyList` + `useAgencyDetail`

**Files:**
- Create: `src/hooks/useAgencyList.js`
- Create: `src/hooks/useAgencyDetail.js`

Тонкие обёртки над supabase RPC. Хуки следуют паттерну `useTeamList` / `useUserOverdueCount` (returns `{ data, loading, error, reload }`).

- [ ] **Step 1: Create `src/hooks/useAgencyList.js`**

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Wraps `list_all_agencies` RPC. Returns flattened rows + loading/error/reload.
 * Superadmin-only RPC (выкинет ошибку для прочих).
 */
export function useAgencyList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('list_all_agencies')
    if (err) {
      setError(err.message)
      setRows([])
    } else {
      setRows(
        (data ?? []).map((r) => ({
          id: r.out_id,
          name: r.out_name,
          platform_id: r.out_platform_id,
          platform_name: r.out_platform_name,
          is_active: r.out_is_active,
          admin_count: r.out_admin_count,
          user_count: r.out_user_count,
          client_count: r.out_client_count,
          team_count: r.out_team_count,
          created_at: r.out_created_at,
        })),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, reload }
}
```

- [ ] **Step 2: Create `src/hooks/useAgencyDetail.js`**

```js
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Wraps `get_agency_full(p_id)` RPC. Loads full agency record incl. counters
 * and joined platform name. Returns `{ agency, loading, error, reload }`.
 *
 * Re-loads when `agencyId` changes.
 */
export function useAgencyDetail(agencyId) {
  const [agency, setAgency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!agencyId) {
      setAgency(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('get_agency_full', { p_id: agencyId })
    if (err) {
      setError(err.message)
      setAgency(null)
    } else if (!data || data.length === 0) {
      setError('Агентство не найдено')
      setAgency(null)
    } else {
      const r = data[0]
      setAgency({
        id: r.out_id,
        name: r.out_name,
        platform_id: r.out_platform_id,
        platform_name: r.out_platform_name,
        logo_url: r.out_logo_url,
        contacts: Array.isArray(r.out_contacts) ? r.out_contacts : [],
        access_login: r.out_access_login,
        access_password: r.out_access_password,
        notes: r.out_notes,
        is_active: r.out_is_active,
        created_at: r.out_created_at,
        admin_count: r.out_admin_count,
        user_count: r.out_user_count,
        client_count: r.out_client_count,
        team_count: r.out_team_count,
      })
    }
    setLoading(false)
  }, [agencyId])

  useEffect(() => {
    reload()
  }, [reload])

  return { agency, loading, error, reload }
}
```

- [ ] **Step 3: Sanity build**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAgencyList.js src/hooks/useAgencyDetail.js
git commit -m "feat(agencies): add useAgencyList + useAgencyDetail hooks"
```

---

## Task 2: List pane primitives

**Files:**
- Create: `src/components/agencies/AgencyListItem.jsx`
- Create: `src/components/agencies/AgencyList.jsx`
- Create: `src/components/agencies/AgencyFilterChips.jsx`
- Create: `src/components/agencies/EmptyZero.jsx`
- Create: `src/components/agencies/EmptyFilter.jsx`
- Create: `src/components/agencies/DetailEmptyHint.jsx`

Все 6 файлов — visual primitives без RPC. Тестов на них нет (паттерн TeamListItem / TeamFilterChips тоже без отдельных тестов). Группируем в один task / один commit для скорости.

- [ ] **Step 1: Create `AgencyListItem.jsx`**

```jsx
import { Link } from 'react-router-dom'

/**
 * Single row in master-list. Mirror TeamListItem visual:
 * round avatar 36px (initials) + name + platform subtitle + counters line.
 * Active = vertical primary accent bar + bg-muted.
 * Archived = muted opacity throughout.
 */
export function AgencyListItem({ agency, isActive }) {
  const archived = !agency.is_active
  const initial = agency.name?.[0]?.toUpperCase() ?? '?'
  const counters = formatCounters(agency)

  return (
    <Link
      to={`/admin/agencies/${agency.id}`}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary',
          archived && 'opacity-60',
        ].filter(Boolean).join(' ')}
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={[
            'truncate text-sm font-medium',
            archived ? 'text-muted-foreground' : 'text-foreground',
          ].join(' ')}
        >
          {agency.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {agency.platform_name ?? '—'}
        </p>
        <p className="truncate text-xs text-muted-foreground/80">{counters}</p>
      </div>
    </Link>
  )
}

function formatCounters(a) {
  const parts = [
    pluralize(a.user_count ?? 0, 'сотрудник', 'сотрудника', 'сотрудников'),
    pluralize(a.client_count ?? 0, 'клиент', 'клиента', 'клиентов'),
    pluralize(a.team_count ?? 0, 'команда', 'команды', 'команд'),
  ]
  return parts.join(' · ')
}

function pluralize(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  let form
  if (m100 >= 11 && m100 <= 14) form = many
  else if (m10 === 1) form = one
  else if (m10 >= 2 && m10 <= 4) form = few
  else form = many
  return `${n} ${form}`
}
```

- [ ] **Step 2: Create `AgencyList.jsx`**

```jsx
import { AgencyListItem } from './AgencyListItem.jsx'

export function AgencyList({ rows, selectedId }) {
  return (
    <ul className="flex flex-col py-1" aria-label="Список агентств">
      {rows.map((a) => (
        <li key={a.id}>
          <AgencyListItem agency={a} isActive={a.id === selectedId} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Create `AgencyFilterChips.jsx`**

```jsx
const OPTIONS = [
  { value: 'active',  label: 'Активные' },
  { value: 'archive', label: 'Архив' },
  { value: 'all',     label: 'Все' },
]

export function AgencyFilterChips({ value, onChange }) {
  return (
    <div role="radiogroup" className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((opt) => {
        const isActive = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.value)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Create `EmptyZero.jsx`**

```jsx
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyZero({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="mb-4 text-sm text-muted-foreground">Агентств пока нет</p>
      <Button size="sm" onClick={onCreate}>+ Создать первое</Button>
    </div>
  )
}
```

- [ ] **Step 5: Create `EmptyFilter.jsx`**

```jsx
import { Button } from '@/components/ui/button'

export function EmptyFilter({ hasSearch, status, onClearSearch, onResetStatus }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="mb-3 text-sm text-muted-foreground">Ничего не найдено</p>
      <div className="flex gap-2">
        {hasSearch && (
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Очистить поиск
          </Button>
        )}
        {status !== 'active' && (
          <Button variant="outline" size="sm" onClick={onResetStatus}>
            Показать активные
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `DetailEmptyHint.jsx`**

```jsx
export function DetailEmptyHint({ error = null }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className={error ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {error ?? 'Выберите агентство слева'}
      </p>
    </div>
  )
}
```

- [ ] **Step 7: Sanity build**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/agencies/AgencyListItem.jsx \
        src/components/agencies/AgencyList.jsx \
        src/components/agencies/AgencyFilterChips.jsx \
        src/components/agencies/EmptyZero.jsx \
        src/components/agencies/EmptyFilter.jsx \
        src/components/agencies/DetailEmptyHint.jsx
git commit -m "feat(agencies): add list-pane primitives (item, list, chips, empties, hint)"
```

---

## Task 3: `ArchiveAgencyDialog` — TDD

**Files:**
- Create: `src/components/agencies/ArchiveAgencyDialog.jsx`
- Create: `src/components/agencies/ArchiveAgencyDialog.test.jsx`

shadcn `<Dialog>` confirmation. На confirm — `archive_agency` RPC; на success — `onArchived()`. Reference: `src/components/teams/ArchiveTeamConfirmDialog.jsx`.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/ArchiveAgencyDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { ArchiveAgencyDialog } from './ArchiveAgencyDialog.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = { id: 'a-1', name: 'Test Agency' }

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('ArchiveAgencyDialog', () => {
  it('calls archive_agency RPC on confirm', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    const onArchived = vi.fn()
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={onArchived} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Архивировать/i }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('archive_agency', { p_agency_id: 'a-1' })
    })
    await waitFor(() => expect(onArchived).toHaveBeenCalled())
  })

  it('shows error inline on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: { message: 'у агентства есть активные клиенты' } })
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Архивировать/i }))
    await waitFor(() => {
      expect(screen.getByText(/активные клиенты/i)).toBeInTheDocument()
    })
  })

  it('renders agency name in description', () => {
    render(
      <ArchiveAgencyDialog agency={agency} onClose={() => {}} onArchived={() => {}} />,
    )
    expect(screen.getByText(/Test Agency/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/ArchiveAgencyDialog.test.jsx
```

Expected: 3 failed (Cannot find module).

- [ ] **Step 3: Implement `ArchiveAgencyDialog.jsx`**

Create `src/components/agencies/ArchiveAgencyDialog.jsx`:

```jsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '../../supabaseClient.js'

export function ArchiveAgencyDialog({ agency, onClose, onArchived }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('archive_agency', {
      p_agency_id: agency.id,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    onArchived()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Архивировать агентство?</DialogTitle>
          <DialogDescription>
            «{agency.name}» будет скрыто из активного списка. У агентства не должно быть
            активных пользователей, клиентов или команд — иначе RPC вернёт ошибку.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive break-words" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отменить
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={submitting}>
            {submitting ? 'Архивируем…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/ArchiveAgencyDialog.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/agencies/ArchiveAgencyDialog.jsx \
        src/components/agencies/ArchiveAgencyDialog.test.jsx
git commit -m "feat(agencies): add ArchiveAgencyDialog (shadcn Dialog + archive_agency RPC)"
```

---

## Task 4: `CreateAgencySlideOut` — TDD

**Files:**
- Create: `src/components/agencies/CreateAgencySlideOut.jsx`
- Create: `src/components/agencies/CreateAgencySlideOut.test.jsx`

shadcn `<Sheet side="right">` с form: name + platform select + admins multi-select. Reference: `src/components/teams/CreateTeamSlideOut.jsx`.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/CreateAgencySlideOut.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

import { CreateAgencySlideOut } from './CreateAgencySlideOut.jsx'
import { supabase } from '../../supabaseClient.js'

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  // Mock platforms + admins fetch
  supabase.from.mockImplementation((table) => {
    if (table === 'platforms') {
      return {
        select: () => ({
          order: () =>
            Promise.resolve({
              data: [
                { id: 'p-1', name: 'PRIME' },
                { id: 'p-2', name: 'AFA' },
              ],
              error: null,
            }),
        }),
      }
    }
    if (table === 'dashboard_users') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 1, email: 'admin1@x.com', first_name: 'Иван', last_name: 'Иванов' },
                    { id: 2, email: 'admin2@x.com', first_name: null, last_name: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    }
    return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }
  })
})

function renderSlideOut(props = {}) {
  return render(
    <MemoryRouter>
      <CreateAgencySlideOut onClose={() => {}} onCreated={() => {}} {...props} />
    </MemoryRouter>,
  )
}

describe('CreateAgencySlideOut', () => {
  it('disables submit when name or platform empty', async () => {
    renderSlideOut()
    const btn = await screen.findByRole('button', { name: /Создать/i })
    expect(btn).toBeDisabled()
  })

  it('calls create_agency RPC and onCreated on submit', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: 'new-agency-uuid',
      error: null,
    })
    const onCreated = vi.fn()
    renderSlideOut({ onCreated })
    fireEvent.change(await screen.findByLabelText(/Название/i), {
      target: { value: 'New Agency' },
    })
    fireEvent.change(await screen.findByLabelText(/Платформа/i), {
      target: { value: 'p-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('create_agency', expect.objectContaining({
        p_name: 'New Agency',
        p_platform_id: 'p-1',
        p_admin_ids: [],
      }))
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('shows error inline on RPC failure', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'уже существует' } })
    renderSlideOut()
    fireEvent.change(await screen.findByLabelText(/Название/i), {
      target: { value: 'Duplicate' },
    })
    fireEvent.change(await screen.findByLabelText(/Платформа/i), {
      target: { value: 'p-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByText(/уже существует/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/CreateAgencySlideOut.test.jsx
```

Expected: 3 failed (Cannot find module).

- [ ] **Step 3: Implement `CreateAgencySlideOut.jsx`**

Create `src/components/agencies/CreateAgencySlideOut.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function CreateAgencySlideOut({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [platformId, setPlatformId] = useState('')
  const [platforms, setPlatforms] = useState([])
  const [admins, setAdmins] = useState([])
  const [selectedAdminIds, setSelectedAdminIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: p } = await supabase
        .from('platforms')
        .select('id, name')
        .order('name')
      if (!cancelled) setPlatforms(p ?? [])

      const { data: a } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (!cancelled) setAdmins(a ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = name.trim().length > 0 && platformId && !submitting

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('create_agency', {
      p_name: name.trim(),
      p_platform_id: platformId,
      p_admin_ids: selectedAdminIds,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    onCreated(data)
  }

  // Cmd/Ctrl+Enter → submit
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit(e)
    }
  }

  const toggleAdmin = (id) => {
    setSelectedAdminIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    )
  }

  const adminLabel = (a) =>
    a.first_name || a.last_name
      ? `${(a.first_name ?? '') + ' ' + (a.last_name ?? '')}`.trim() + ' · ' + a.email
      : a.email

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Новое агентство</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} onKeyDown={onKeyDown} className="flex-1 overflow-y-auto space-y-4 py-4">
          <label className="block">
            <span className="block mb-1 text-sm font-medium">Название</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block">
            <span className="block mb-1 text-sm font-medium">Платформа</span>
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="" disabled>
                — выбрать —
              </option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="block mb-1 text-sm font-medium">Админы (опционально)</span>
            {selectedAdminIds.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedAdminIds.map((id) => {
                  const a = admins.find((x) => x.id === id)
                  if (!a) return null
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                    >
                      {adminLabel(a)}
                      <button
                        type="button"
                        onClick={() => toggleAdmin(id)}
                        aria-label={`Убрать ${adminLabel(a)}`}
                        className="hover:opacity-70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            {admins.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                Нет admin-пользователей. Создай в /staff.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-1">
                {admins.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAdminIds.includes(a.id)}
                      onChange={() => toggleAdmin(a.id)}
                      className="h-4 w-4"
                    />
                    <span className="truncate">{adminLabel(a)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive break-words" role="alert">
              {error}
            </p>
          )}
        </form>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отменить
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {submitting ? 'Создаём…' : 'Создать'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/CreateAgencySlideOut.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/agencies/CreateAgencySlideOut.jsx \
        src/components/agencies/CreateAgencySlideOut.test.jsx
git commit -m "feat(agencies): add CreateAgencySlideOut (shadcn Sheet + create_agency RPC)"
```

---

## Task 5: `AgencyBrandingTab` — TDD

**Files:**
- Create: `src/components/agencies/AgencyBrandingTab.jsx`
- Create: `src/components/agencies/AgencyBrandingTab.test.jsx`

Tab content для брендинга: logo upload + access login/password (с show/hide) + notes. Sub получает `{ agency, reload }` через `useOutletContext`. Save → `update_agency_branding` с branding-only slice.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/AgencyBrandingTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { AgencyBrandingTab } from './AgencyBrandingTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = {
  id: 'a-1',
  name: 'Test',
  logo_url: 'https://example.com/logo.png',
  access_login: 'login1',
  access_password: 'pw1',
  notes: 'note1',
}

function renderWithContext(ctxAgency = agency) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<OutletProvider agency={ctxAgency} reload={vi.fn()} />}>
          <Route path="/" element={<AgencyBrandingTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// Helper to wrap Outlet with context
function OutletProvider({ agency, reload }) {
  const { Outlet } = require('react-router-dom')
  return <Outlet context={{ agency, reload }} />
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('AgencyBrandingTab', () => {
  it('hydrates form fields from outlet context', () => {
    renderWithContext()
    expect(screen.getByLabelText(/Логин/i)).toHaveValue('login1')
    expect(screen.getByLabelText(/Заметки/i)).toHaveValue('note1')
  })

  it('disables Save when not dirty', () => {
    renderWithContext()
    const btn = screen.getByRole('button', { name: /Сохранить/i })
    expect(btn).toBeDisabled()
  })

  it('calls update_agency_branding with branding slice (other params null) on save', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    renderWithContext()
    fireEvent.change(screen.getByLabelText(/Логин/i), { target: { value: 'login2' } })
    const btn = screen.getByRole('button', { name: /Сохранить/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('update_agency_branding', expect.objectContaining({
        p_id: 'a-1',
        p_access_login: 'login2',
        p_contacts: null,  // contacts not touched
      }))
    })
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/AgencyBrandingTab.test.jsx
```

Expected: 3 failed (Cannot find module).

- [ ] **Step 3: Implement `AgencyBrandingTab.jsx`**

Create `src/components/agencies/AgencyBrandingTab.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Eye, EyeOff, ImagePlus, Loader2 } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { Button } from '@/components/ui/button'
import { adminFetch } from '../../lib/adminFetch.js'

async function uploadLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const { data, error } = await adminFetch('/api/admin/upload-logo', {
        file: base64,
        filename: file.name,
        content_type: file.type,
      })
      if (error) reject(new Error(error.message || 'Upload failed'))
      else resolve(data.url)
    }
    reader.onerror = () => reject(new Error('File read error'))
    reader.readAsDataURL(file)
  })
}

const initialFor = (a) => ({
  logo_url: a?.logo_url ?? '',
  access_login: a?.access_login ?? '',
  access_password: a?.access_password ?? '',
  notes: a?.notes ?? '',
})

export function AgencyBrandingTab() {
  const { agency, reload } = useOutletContext()
  const [form, setForm] = useState(() => initialFor(agency))
  const [dirty, setDirty] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Hydrate when switching to a different agency
  useEffect(() => {
    setForm(initialFor(agency))
    setDirty(false)
    setError(null)
  }, [agency.id])

  const update = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLogo(file)
      update({ logo_url: url })
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const cancel = () => {
    setForm(initialFor(agency))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('update_agency_branding', {
      p_id: agency.id,
      p_logo_url: form.logo_url || null,
      p_contacts: null, // не трогаем contacts из этого таба
      p_access_login: form.access_login || null,
      p_access_password: form.access_password || null,
      p_notes: form.notes || null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setDirty(false)
    reload?.()
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save()
  }

  return (
    <div className="max-w-2xl space-y-6" onKeyDown={onKeyDown}>
      {/* Logo */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Логотип
        </p>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt=""
              className="h-12 max-w-24 rounded-lg border border-border object-contain"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <label className="cursor-pointer">
            <Button asChild size="sm" variant="outline" disabled={uploading || saving}>
              <span>
                {uploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {uploading ? 'Загрузка…' : 'Выбрать файл'}
              </span>
            </Button>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              disabled={uploading || saving}
            />
          </label>
        </div>
      </section>

      {/* Access */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Доступ к платформе
        </p>
        <div className="space-y-2">
          <label className="block">
            <span className="block mb-1 text-sm font-medium">Логин</span>
            <input
              type="text"
              value={form.access_login}
              onChange={(e) => update({ access_login: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <span className="block mb-1 text-sm font-medium">Пароль</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.access_password}
                onChange={(e) => update({ access_password: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={saving}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
        </div>
      </section>

      {/* Notes */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Заметки
        </p>
        <label className="block">
          <span className="sr-only">Заметки</span>
          <textarea
            value={form.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={4}
            disabled={saving}
            placeholder="Дополнительная информация"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </section>

      {error && (
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>
          Отменить
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/AgencyBrandingTab.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/agencies/AgencyBrandingTab.jsx \
        src/components/agencies/AgencyBrandingTab.test.jsx
git commit -m "feat(agencies): add AgencyBrandingTab (logo + access + notes, save via update_agency_branding)"
```

---

## Task 6: `AgencyContactsTab` — TDD

**Files:**
- Create: `src/components/agencies/AgencyContactsTab.jsx`
- Create: `src/components/agencies/AgencyContactsTab.test.jsx`

Multi-contacts editor: cards со полями name/role/phone/email/telegram. Add/remove + save. Clean пустые рядки перед отправкой.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/AgencyContactsTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))

import { AgencyContactsTab } from './AgencyContactsTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agencyWithOne = {
  id: 'a-1',
  contacts: [{ name: 'Иван', role: 'Менеджер', phone: '+7', email: '', telegram: '' }],
}

function renderWith(ctxAgency) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<OutletWrap ctxAgency={ctxAgency} />}>
          <Route path="/" element={<AgencyContactsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function OutletWrap({ ctxAgency }) {
  return <Outlet context={{ agency: ctxAgency, reload: vi.fn() }} />
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('AgencyContactsTab', () => {
  it('renders existing contacts hydrated from outlet', () => {
    renderWith(agencyWithOne)
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Менеджер')).toBeInTheDocument()
  })

  it('add and remove contact buttons mutate count', () => {
    renderWith(agencyWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(2)
    // Remove appears since now > 1
    const removeBtns = screen.getAllByRole('button', { name: /Удалить контакт/i })
    fireEvent.click(removeBtns[0])
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(1)
  })

  it('save filters empty contacts and sends contacts-only slice', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: null })
    renderWith(agencyWithOne)
    // Add empty contact (will be filtered out)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    // Trigger dirty by editing existing
    fireEvent.change(screen.getByDisplayValue('Иван'), { target: { value: 'Иван П.' } })
    const save = screen.getByRole('button', { name: /Сохранить/i })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'update_agency_branding',
        expect.objectContaining({
          p_id: 'a-1',
          p_logo_url: null,
          p_contacts: [
            expect.objectContaining({ name: 'Иван П.' }),
            // Empty contact filtered out, so only 1 in array
          ],
          p_access_login: null,
          p_access_password: null,
          p_notes: null,
        }),
      )
    })
    // Verify only 1 contact in the array (empty filtered)
    const call = supabase.rpc.mock.calls[0][1]
    expect(call.p_contacts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/AgencyContactsTab.test.jsx
```

Expected: 3 failed (Cannot find module).

- [ ] **Step 3: Implement `AgencyContactsTab.jsx`**

Create `src/components/agencies/AgencyContactsTab.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { Button } from '@/components/ui/button'

const EMPTY_CONTACT = { name: '', role: '', phone: '', email: '', telegram: '' }

const isContactEmpty = (c) =>
  !c.name && !c.role && !c.phone && !c.email && !c.telegram

const initialFor = (a) => {
  const arr = Array.isArray(a?.contacts) ? a.contacts : []
  return arr.length ? arr.map((c) => ({ ...EMPTY_CONTACT, ...c })) : [{ ...EMPTY_CONTACT }]
}

export function AgencyContactsTab() {
  const { agency, reload } = useOutletContext()
  const [contacts, setContacts] = useState(() => initialFor(agency))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setContacts(initialFor(agency))
    setDirty(false)
    setError(null)
  }, [agency.id])

  const updateAt = (i, patch) => {
    setContacts((curr) => curr.map((c, j) => (j === i ? { ...c, ...patch } : c)))
    setDirty(true)
  }

  const add = () => {
    setContacts((curr) => [...curr, { ...EMPTY_CONTACT }])
    setDirty(true)
  }

  const removeAt = (i) => {
    setContacts((curr) => curr.filter((_, j) => j !== i))
    setDirty(true)
  }

  const cancel = () => {
    setContacts(initialFor(agency))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const cleaned = contacts.filter((c) => !isContactEmpty(c))
    const { error: err } = await supabase.rpc('update_agency_branding', {
      p_id: agency.id,
      p_logo_url: null,
      p_contacts: cleaned,
      p_access_login: null,
      p_access_password: null,
      p_notes: null,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setDirty(false)
    reload?.()
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save()
  }

  return (
    <div className="max-w-2xl space-y-4" onKeyDown={onKeyDown}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Контакты менеджеров
      </p>

      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div
            key={i}
            className="relative rounded-lg border border-border bg-card p-4 space-y-2"
          >
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={saving}
                aria-label="Удалить контакт"
                className="absolute right-2 top-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Имя"
                value={c.name}
                onChange={(e) => updateAt(i, { name: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                placeholder="Должность"
                value={c.role}
                onChange={(e) => updateAt(i, { role: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Телефон"
                value={c.phone}
                onChange={(e) => updateAt(i, { phone: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                placeholder="Email"
                type="email"
                value={c.email}
                onChange={(e) => updateAt(i, { email: e.target.value })}
                disabled={saving}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <input
              placeholder="Telegram (@username)"
              value={c.telegram}
              onChange={(e) => updateAt(i, { telegram: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={add} disabled={saving}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Добавить контакт
      </Button>

      {error && (
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={cancel} disabled={!dirty || saving}>
          Отменить
        </Button>
        <Button onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {saving ? 'Сохранение…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/AgencyContactsTab.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/agencies/AgencyContactsTab.jsx \
        src/components/agencies/AgencyContactsTab.test.jsx
git commit -m "feat(agencies): add AgencyContactsTab (multi-contact editor, save via update_agency_branding)"
```

---

## Task 7: `AgencyAdminsTab` — TDD

**Files:**
- Create: `src/components/agencies/AgencyAdminsTab.jsx`
- Create: `src/components/agencies/AgencyAdminsTab.test.jsx`

Список всех active admins с checkbox toggle. Auto-save per toggle (no save button). Optimistic update + rollback на ошибке.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/AgencyAdminsTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

import { AgencyAdminsTab } from './AgencyAdminsTab.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = { id: 'a-1' }

function renderWith() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ agency, reload: vi.fn() }} />}>
          <Route path="/" element={<AgencyAdminsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.from.mockReset()
  // Mock dashboard_users + list_agency_admins
  supabase.from.mockImplementation((table) => {
    if (table === 'dashboard_users') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    { id: 1, email: 'a1@x.com', first_name: 'А', last_name: 'А' },
                    { id: 2, email: 'a2@x.com', first_name: 'Б', last_name: 'Б' },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }
    }
    return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }
  })
  supabase.rpc.mockImplementation((name) => {
    if (name === 'list_agency_admins') {
      return Promise.resolve({ data: [{ admin_id: 1 }], error: null })
    }
    return Promise.resolve({ error: null })
  })
})

describe('AgencyAdminsTab', () => {
  it('renders admins with current assignments', async () => {
    renderWith()
    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeChecked()    // admin 1 assigned
    expect(checkboxes[1]).not.toBeChecked() // admin 2 not assigned
  })

  it('calls assign_admin_to_agency on unchecked → checked', async () => {
    renderWith()
    await waitFor(() => screen.getAllByRole('checkbox'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]) // unchecked → checked
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('assign_admin_to_agency', {
        p_admin_id: 2,
        p_agency_id: 'a-1',
      })
    })
  })

  it('calls remove_admin_from_agency on checked → unchecked', async () => {
    renderWith()
    await waitFor(() => screen.getAllByRole('checkbox'))
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // checked → unchecked
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('remove_admin_from_agency', {
        p_admin_id: 1,
        p_agency_id: 'a-1',
      })
    })
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/AgencyAdminsTab.test.jsx
```

Expected: 3 failed.

- [ ] **Step 3: Implement `AgencyAdminsTab.jsx`**

Create `src/components/agencies/AgencyAdminsTab.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'

export function AgencyAdminsTab() {
  const { agency } = useOutletContext()
  const [admins, setAdmins] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data: users, error: uErr } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      if (uErr) {
        setError(uErr.message)
        setLoading(false)
        return
      }
      setAdmins(users ?? [])

      const { data: links, error: lErr } = await supabase.rpc('list_agency_admins', {
        p_agency_id: agency.id,
      })
      if (cancelled) return
      if (lErr) {
        setError(lErr.message)
        setLoading(false)
        return
      }
      setAssigned(new Set((links ?? []).map((l) => l.admin_id)))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [agency.id])

  const toggle = async (adminId) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const wasAssigned = assigned.has(adminId)
    // Optimistic update
    const next = new Set(assigned)
    if (wasAssigned) next.delete(adminId)
    else next.add(adminId)
    setAssigned(next)

    const rpcName = wasAssigned ? 'remove_admin_from_agency' : 'assign_admin_to_agency'
    const { error: err } = await supabase.rpc(rpcName, {
      p_admin_id: adminId,
      p_agency_id: agency.id,
    })
    if (err) {
      // Rollback
      setAssigned(assigned)
      setError(err.message)
    }
    setBusy(false)
  }

  const adminLabel = (a) =>
    a.first_name || a.last_name
      ? `${(a.first_name ?? '') + ' ' + (a.last_name ?? '')}`.trim() + ' · ' + a.email
      : a.email

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Админы агентства
      </p>
      {error && (
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет admin-пользователей. Создай в /staff.
        </p>
      ) : (
        <ul className="rounded-lg border border-border bg-card p-2 max-h-96 overflow-y-auto">
          {admins.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={assigned.has(a.id)}
                  onChange={() => toggle(a.id)}
                  disabled={busy}
                  className="h-4 w-4"
                />
                <span className="truncate">{adminLabel(a)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Изменения сохраняются автоматически.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/AgencyAdminsTab.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/agencies/AgencyAdminsTab.jsx \
        src/components/agencies/AgencyAdminsTab.test.jsx
git commit -m "feat(agencies): add AgencyAdminsTab (auto-save checkbox toggle)"
```

---

## Task 8: `AgencyDetailPanel` — TDD (rewritten in-place)

**Files:**
- Modify: `src/components/agencies/AgencyDetailPanel.jsx` (полная замена 180 LOC overlay → ~150 LOC nested-shell)
- Create: `src/components/agencies/AgencyDetailPanel.test.jsx`

Header (back button mobile, name, platform, status badge, dropdown menu) + shadcn Tabs nav + `<Outlet />`. Sub получает `{ agency, reload }` через outlet context.

- [ ] **Step 1: Write failing test**

Create `src/components/agencies/AgencyDetailPanel.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { AgencyDetailPanel } from './AgencyDetailPanel.jsx'
import { supabase } from '../../supabaseClient.js'

const agency = {
  out_id: 'a-1',
  out_name: 'Test',
  out_platform_id: 'p-1',
  out_platform_name: 'PRIME',
  out_logo_url: null,
  out_contacts: [],
  out_access_login: null,
  out_access_password: null,
  out_notes: null,
  out_is_active: true,
  out_created_at: null,
  out_admin_count: 0,
  out_user_count: 0,
  out_client_count: 0,
  out_team_count: 0,
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/agencies/:agencyId" element={<AgencyDetailPanel onBack={() => {}} onChanged={() => {}} />}>
          <Route index element={<div data-testid="tab-content">empty</div>} />
          <Route path="branding" element={<div data-testid="tab-content">branding</div>} />
          <Route path="contacts" element={<div data-testid="tab-content">contacts</div>} />
          <Route path="admins" element={<div data-testid="tab-content">admins</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: [agency], error: null })
})

describe('AgencyDetailPanel', () => {
  it('renders header with name + platform + status badge', async () => {
    renderAt('/admin/agencies/a-1/branding')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test' })).toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
    expect(screen.getByText(/Активно/)).toBeInTheDocument()
  })

  it('renders all 3 tabs', async () => {
    renderAt('/admin/agencies/a-1/branding')
    await waitFor(() => screen.getByRole('tab', { name: /Бренд/i }))
    expect(screen.getByRole('tab', { name: /Бренд/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Контакты/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Админы/i })).toBeInTheDocument()
  })

  it('renders child route content via Outlet', async () => {
    renderAt('/admin/agencies/a-1/contacts')
    await waitFor(() => {
      expect(screen.getByTestId('tab-content')).toHaveTextContent('contacts')
    })
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/components/agencies/AgencyDetailPanel.test.jsx
```

Expected: tests fail (current AgencyDetailPanel has different signature — old overlay).

- [ ] **Step 3: Rewrite `AgencyDetailPanel.jsx` in-place**

Overwrite `src/components/agencies/AgencyDetailPanel.jsx` with:

```jsx
import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MoreVertical } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgencyDetail } from '../../hooks/useAgencyDetail.js'
import { ArchiveAgencyDialog } from './ArchiveAgencyDialog.jsx'
import { DetailEmptyHint } from './DetailEmptyHint.jsx'

const TABS = [
  { value: 'branding', label: 'Бренд' },
  { value: 'contacts', label: 'Контакты' },
  { value: 'admins',   label: 'Админы' },
]

export function AgencyDetailPanel({ onBack, onChanged }) {
  const { agencyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const { agency, loading, error, reload } = useAgencyDetail(agencyId)
  const [archiveOpen, setArchiveOpen] = useState(false)

  // Determine current tab from URL last segment
  const segments = location.pathname.split('/')
  const lastSegment = segments[segments.length - 1]
  const currentTab = TABS.some((t) => t.value === lastSegment) ? lastSegment : 'branding'

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-border px-6 py-4 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
        </header>
      </div>
    )
  }

  if (error || !agency) {
    return <DetailEmptyHint error={error ?? 'Агентство не найдено'} />
  }

  const handleAfterChange = () => {
    reload()
    onChanged?.()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={onBack} aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{agency.name}</h1>
              <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                <span className="truncate">{agency.platform_name ?? '—'}</span>
                <span>·</span>
                {agency.is_active ? (
                  <Badge variant="outline">Активно</Badge>
                ) : (
                  <Badge variant="secondary">Архив</Badge>
                )}
              </p>
            </div>
          </div>
          {agency.is_active && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Меню действий">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setArchiveOpen(true)}
                  className="text-destructive"
                >
                  Архивировать
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Tabs
          value={currentTab}
          onValueChange={(v) => navigate(`/admin/agencies/${agencyId}/${v}`)}
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <Outlet context={{ agency, reload: handleAfterChange }} />
      </main>

      {archiveOpen && (
        <ArchiveAgencyDialog
          agency={agency}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => {
            setArchiveOpen(false)
            handleAfterChange()
            navigate('/admin/agencies')
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/components/agencies/AgencyDetailPanel.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Build sanity (legacy AgencyBrandingFields/etc still imported by AgencyDetailPanel BEFORE rewrite — после rewrite уже нет)**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean (новый AgencyDetailPanel не импортирует legacy fields, но они всё ещё существуют — только в файлах, которые продолжают их импортировать. Это OK.)

- [ ] **Step 6: Commit**

```bash
git add src/components/agencies/AgencyDetailPanel.jsx \
        src/components/agencies/AgencyDetailPanel.test.jsx
git commit -m "feat(agencies): rewrite AgencyDetailPanel as nested-shell (header + tabs + Outlet)"
```

---

## Task 9: `AgencyListPage` — TDD (integration)

**Files:**
- Create: `src/pages/AgencyListPage.jsx`
- Create: `src/pages/AgencyListPage.test.jsx`

Page-level shell с MasterDetailLayout + ListPane + filters + search + create button. Exports `AgencyListPage`, `AgencyDetailRoute`, `AgencyDetailEmpty`.

- [ ] **Step 1: Write failing test**

Create `src/pages/AgencyListPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn() },
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { AgencyListPage, AgencyDetailEmpty } from './AgencyListPage.jsx'
import { supabase } from '../supabaseClient.js'

const mockRows = [
  {
    out_id: 'a-1', out_name: 'Active Agency', out_platform_id: 'p-1', out_platform_name: 'PRIME',
    out_is_active: true, out_admin_count: 1, out_user_count: 3, out_client_count: 5, out_team_count: 2, out_created_at: null,
  },
  {
    out_id: 'a-2', out_name: 'Archived Agency', out_platform_id: 'p-2', out_platform_name: 'AFA',
    out_is_active: false, out_admin_count: 0, out_user_count: 0, out_client_count: 0, out_team_count: 0, out_created_at: null,
  },
]

function renderPage(initialPath = '/admin/agencies') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/agencies" element={<AgencyListPage />}>
          <Route index element={<AgencyDetailEmpty />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockImplementation((name) => {
    if (name === 'list_all_agencies') {
      return Promise.resolve({ data: mockRows, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
})

describe('AgencyListPage', () => {
  it('renders title with count and active agencies by default', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Active Agency')).toBeInTheDocument()
    })
    // Archived should NOT show by default
    expect(screen.queryByText('Archived Agency')).not.toBeInTheDocument()
  })

  it('switching filter chip shows archived agencies', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.click(screen.getByRole('radio', { name: /Архив/i }))
    await waitFor(() => {
      expect(screen.getByText('Archived Agency')).toBeInTheDocument()
    })
    expect(screen.queryByText('Active Agency')).not.toBeInTheDocument()
  })

  it('search filters list by name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.click(screen.getByRole('radio', { name: /Все/i }))
    await waitFor(() => screen.getByText('Archived Agency'))
    const searchInput = screen.getByPlaceholderText(/Поиск/i)
    fireEvent.change(searchInput, { target: { value: 'archived' } })
    await waitFor(() => {
      expect(screen.queryByText('Active Agency')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Archived Agency')).toBeInTheDocument()
  })

  it('shows EmptyFilter when search filters everything out', async () => {
    renderPage()
    await waitFor(() => screen.getByText('Active Agency'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument()
    })
  })

  it('renders detail empty hint when no agency selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Выберите агентство/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run -- src/pages/AgencyListPage.test.jsx
```

Expected: 5 failed.

- [ ] **Step 3: Implement `AgencyListPage.jsx`**

Create `src/pages/AgencyListPage.jsx`:

```jsx
import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { useAgencyList } from '../hooks/useAgencyList.js'
import { AgencyList } from '../components/agencies/AgencyList.jsx'
import { AgencyFilterChips } from '../components/agencies/AgencyFilterChips.jsx'
import { AgencyDetailPanel } from '../components/agencies/AgencyDetailPanel.jsx'
import { CreateAgencySlideOut } from '../components/agencies/CreateAgencySlideOut.jsx'
import { EmptyZero } from '../components/agencies/EmptyZero.jsx'
import { EmptyFilter } from '../components/agencies/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/agencies/DetailEmptyHint.jsx'

export function AgencyListPage() {
  const navigate = useNavigate()
  const { agencyId } = useParams()
  const { rows, loading, error, reload } = useAgencyList()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((a) => {
      if (status === 'active' && !a.is_active) return false
      if (status === 'archive' && a.is_active) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, status, search])

  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Агентства
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {filtered.length}
      </span>
    </span>
  )

  const searchNode = (
    <SearchInput
      placeholder="Поиск по названию…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск агентств"
    />
  )

  const filtersNode = !isZeroEmpty ? (
    <AgencyFilterChips value={status} onChange={setStatus} />
  ) : null

  const createButtonNode = (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      + Новое
    </Button>
  )

  const listBody = error ? (
    <p className="px-4 py-6 text-sm text-destructive" role="alert">
      Ошибка: {error}
    </p>
  ) : loading ? (
    <p className="px-4 py-6 text-sm text-muted-foreground">Загрузка…</p>
  ) : isZeroEmpty ? (
    <EmptyZero onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <EmptyFilter
      hasSearch={hasSearch}
      status={status}
      onClearSearch={() => setSearch('')}
      onResetStatus={() => setStatus('active')}
    />
  ) : (
    <AgencyList rows={filtered} selectedId={agencyId ?? null} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={filtersNode}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
        listLabel="Список агентств"
        detailEmpty={!agencyId}
        detailLabel="Агентство"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateAgencySlideOut
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`/admin/agencies/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — empty hint when no agency selected.
export function AgencyDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls agencyId from URL, passes reload from parent context.
export function AgencyDetailRoute() {
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <AgencyDetailPanel
      onBack={() => navigate('/admin/agencies')}
      onChanged={reload}
    />
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run -- src/pages/AgencyListPage.test.jsx
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AgencyListPage.jsx src/pages/AgencyListPage.test.jsx
git commit -m "feat(agencies): add AgencyListPage (master-detail integration with filters/search/create)"
```

---

## Task 10: App.jsx routing + AdminShell padding revert

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/admin-shell/AdminShell.jsx`

Wire `AgencyListPage` через nested routes. Убрать `p-6` с AdminShell `<main>` (компенсация из 7-shell больше не нужна — MasterDetailLayout управляет краями).

- [ ] **Step 1: Read current App.jsx**

```bash
grep -n "AdminAgenciesPage\|AgencyListPage\|/admin/agencies" src/App.jsx
```

Запомнить позицию импорта `AdminAgenciesPage` и блока `/admin` route.

- [ ] **Step 2: Replace `AdminAgenciesPage` import with new exports**

В `src/App.jsx`:

Удалить:
```jsx
import AdminAgenciesPage from './pages/AdminAgenciesPage'
```

Добавить:
```jsx
import {
  AgencyListPage,
  AgencyDetailRoute,
  AgencyDetailEmpty,
} from './pages/AgencyListPage.jsx'
```

- [ ] **Step 3: Replace agencies route block**

Найти:
```jsx
<Route path="agencies/*" element={<AdminAgenciesPage />} />
```

Заменить на:
```jsx
<Route path="agencies" element={<AgencyListPage />}>
  <Route index element={<AgencyDetailEmpty />} />
  <Route path=":agencyId" element={<AgencyDetailRoute />}>
    <Route index element={<Navigate to="branding" replace />} />
    <Route path="branding" element={<AgencyBrandingTab />} />
    <Route path="contacts" element={<AgencyContactsTab />} />
    <Route path="admins" element={<AgencyAdminsTab />} />
  </Route>
</Route>
```

И в импортах добавить:
```jsx
import { AgencyBrandingTab } from './components/agencies/AgencyBrandingTab.jsx'
import { AgencyContactsTab } from './components/agencies/AgencyContactsTab.jsx'
import { AgencyAdminsTab } from './components/agencies/AgencyAdminsTab.jsx'
```

- [ ] **Step 4: Modify `AdminShell.jsx` — remove `p-6` padding**

В `src/components/admin-shell/AdminShell.jsx` найти:
```jsx
<main className="overflow-auto p-6">
```

Заменить на:
```jsx
<main className="overflow-auto">
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

Expected: те же 19 pre-existing failures + 5 AdminShell passes + ~25 новых agencies passes (cumulative). Никаких новых regress.

- [ ] **Step 6: Build + lint**

```bash
npm run build 2>&1 | tail -3
npm run lint 2>&1 | tail -3
```

Expected: build clean; lint показывает baseline 65 problems (могут добавиться или убавиться 1-2 от новых файлов — но не должно быть «error» от новых файлов).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/admin-shell/AdminShell.jsx
git commit -m "feat(admin): wire AgencyListPage nested routes; remove AdminShell p-6 compensation"
```

---

## Task 11: Delete legacy files

**Files:**
- Delete: `src/pages/AdminAgenciesPage.jsx`
- Delete: `src/components/agencies/AgencyTable.jsx`
- Delete: `src/components/agencies/AgencyCreateModal.jsx`
- Delete: `src/components/agencies/AgencyBrandingFields.jsx`
- Delete: `src/components/agencies/AgencyContactsFields.jsx`
- Delete: `src/components/agencies/AgencyAdminAssignments.jsx`

После Task 10 эти файлы — orphan'ы. Удаляем sweep'ом.

- [ ] **Step 1: Final grep — verify no consumers remain**

```bash
grep -rn "AgencyTable\|AgencyCreateModal\|AgencyBrandingFields\|AgencyContactsFields\|AgencyAdminAssignments\|AdminAgenciesPage" src/ --include="*.jsx" --include="*.js"
```

Expected: только сами файлы. Если что-то ещё ссылается — остановиться.

- [ ] **Step 2: Delete files**

```bash
git rm src/pages/AdminAgenciesPage.jsx \
       src/components/agencies/AgencyTable.jsx \
       src/components/agencies/AgencyCreateModal.jsx \
       src/components/agencies/AgencyBrandingFields.jsx \
       src/components/agencies/AgencyContactsFields.jsx \
       src/components/agencies/AgencyAdminAssignments.jsx
```

- [ ] **Step 3: Build + test sanity**

```bash
npm run build 2>&1 | tail -3
npm run test:run 2>&1 | tail -8
```

Expected: build clean; test counts unchanged from Task 10 (ничего не сломалось).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agencies): remove legacy files (Table, CreateModal, BrandingFields, ContactsFields, AdminAssignments, AdminAgenciesPage)"
```

---

## Task 12: Manual smoke test (preview deploy)

**Files:** none (runtime check)

- [ ] **Step 1: Copy `.vercel/` link if missing**

```bash
ls .vercel 2>/dev/null || cp -r /Users/artemsaskin/Work/operator-dashboard/.vercel .vercel
```

- [ ] **Step 2: Deploy preview**

```bash
vercel
```

Expected: preview URL.

- [ ] **Step 3: Walk через сценарии в браузере**

Login as superadmin. Navigate to `/admin/agencies`.

- [ ] (a) ListPane показывает active агентства; chip переключает на архив/все; search фильтрует.
- [ ] (b) `+ Новое` → Sheet → заполнить (name + platform + checkbox админа) → submit → попадаем на `/admin/agencies/<new>/branding`.
- [ ] (c) Branding tab: загрузить лого, изменить access login, сохранить, перезагрузить страницу — persisted.
- [ ] (d) Contacts tab: добавить контакт, заполнить имя+email, сохранить, перезагрузить — persisted.
- [ ] (e) Admins tab: toggle чекбокс — изменение видно сразу; перезагрузить — persisted.
- [ ] (f) Header dropdown «⋯» → «Архивировать» → Dialog → confirm → агентство архивировано, redirect на `/admin/agencies`.
- [ ] (g) Mobile (DevTools 375px): list pane полная ширина; клик по агентству → detail full-screen; back button работает.
- [ ] (h) Other sections (`/staff`, `/clients`, `/teams`, `/admin/platforms`) — без регрессов.
- [ ] (i) `/admin/platforms` без `p-6` обвязки — выглядит закономерно (контент прижат к краю — будет починено в 7-platforms ~24h).

- [ ] **Step 4: Записать результаты**

Если регресс или проблема — поправить (создать additional commit). Если всё ОК — переходим к Task 13.

---

## Task 13: Final validation + memory update + PR + merge + deploy

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md` (memory вне репо)

- [ ] **Step 1: Final test/build/lint**

```bash
npm run test:run
npm run build
npm run lint
```

Expected:
- Tests: те же 19 pre-existing failures + ~30+ новых passes (5 AdminShell + 25 agencies). Total ~330+ passes.
- Build: clean.
- Lint: baseline ~65 problems, без новых от наших файлов.

- [ ] **Step 2: Update memory**

В `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md`:

Найти секцию «Subplan 7-track (admin section DS rebuild) — IN PROGRESS:» и обновить:
```
- ~~7-shell~~ — DONE (PR #63).
- ~~7-agencies~~ — DONE. AgencyListPage с MasterDetailLayout + 3 URL-tabs (branding/contacts/admins) + Sheet/Dialog. 7 новых компонентов + 2 hook'а + 7 тест-файлов (~25 it-blocks). Удалены 6 legacy файлов; AgencyDetailPanel переписан in-place. AdminShell `p-6` removed (MasterDetail manages own edges). PR #<TBD>.
- 7-platforms — master-detail + 2 tabs (Бренд / Контакты) + Sheet + Dialog. Spec & plan TBD; same pattern as 7-agencies.
```

- [ ] **Step 3: Verify clean state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, ~13 commits на ветке.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/subplan-7-agencies
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(admin): subplan 7-agencies — master-detail + URL tabs + Sheet/Dialog" --body "$(cat <<'EOF'
## Summary
- `/admin/agencies` переведено на `MasterDetailLayout` + URL'ные tabs (Бренд / Контакты / Админы) + shadcn `<Sheet>` для Create + `<Dialog>` для Archive.
- Master pane: list-карточка-row (avatar + name + platform + counters); search + chip filter (active/архив/все); button «+ Новое».
- Detail panel: header с name + platform + status badge + dropdown «⋯ Архивировать»; tabs nav через URL.
- Удалены 6 legacy файлов (-591 LOC): AgencyTable, AgencyCreateModal, AgencyBrandingFields, AgencyContactsFields, AgencyAdminAssignments, AdminAgenciesPage.
- AgencyDetailPanel переписан in-place (180 → 150 LOC).
- 2 новых hook'а (useAgencyList, useAgencyDetail) + 7 test-файлов (~25 it-blocks).
- AdminShell `p-6` compensation удалён (master-detail сам управляет краями).
- Никаких новых RPC: existing `list_all_agencies`, `get_agency_full`, `create_agency`, `archive_agency`, `update_agency_branding`, `assign_admin_to_agency`, `remove_admin_from_agency`, `list_agency_admins`.

Spec: `docs/superpowers/specs/2026-05-01-admin-section-redesign-agencies-design.md`
Plan: `docs/superpowers/plans/2026-05-01-admin-section-redesign-agencies.md`

## Test plan
- [x] /admin/agencies: list pane активные; chip переключает; search фильтрует; EmptyFilter при zero-результате.
- [x] + Новое → Sheet → submit → попадаем на /admin/agencies/<new>/branding.
- [x] Branding/Contacts/Admins tabs — каждый сохраняет правильный slice через update_agency_branding или assign/remove RPC.
- [x] Archive Dialog → confirm → агентство в архиве, redirect на /admin/agencies.
- [x] Mobile (375px): collapse в single-pane.
- [x] Other sections (`/staff`, `/clients`, `/teams`, `/admin/platforms`) — без регрессов.
- [x] npm run test:run: ~25 новых passes; pre-existing 19 failures без изменений. Build clean.
- [x] /admin/platforms временно без обвязки `p-6` (будет починено в 7-platforms ~24h).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Update memory с PR номером**

После `gh pr create` — заменить `PR #<TBD>` на реальный номер в memory.

- [ ] **Step 7: Switch gh user перед merge**

Memory `project_gh_auth.md`: `gh pr merge` падает под `temashdesign`; нужен `clubmonaco2017-ops`.

```bash
gh auth switch --user clubmonaco2017-ops
```

- [ ] **Step 8: Merge after approval**

```bash
gh pr merge <PR#> --squash --delete-branch
```

⚠ **Если merge fails из-за worktree** — выполнить из main checkout:
```bash
cd /Users/artemsaskin/Work/operator-dashboard && gh pr merge <PR#> --squash --delete-branch
```

- [ ] **Step 9: Cleanup worktree + sync main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git worktree remove .claude/worktrees/feat-subplan-7-agencies
git branch -D feat/subplan-7-agencies 2>/dev/null || true
git fetch origin main
git rebase origin/main  # may need --skip for already-upstream docs commits
```

- [ ] **Step 10: Production deploy**

Memory `project_vercel_deploy.md`: deploy через CLI, scope `clubmonaco2017-ops-projects`.

```bash
vercel --prod
```

Expected: production deploy URL.

---

## Self-review (после написания плана — выполнено перед сдачей)

1. **Spec coverage** — каждый раздел spec'а покрыт задачей:
   - Goal 1 (master-detail) — Tasks 9, 10.
   - Goal 2 (AgencyListItem visual) — Task 2.
   - Goal 3 (ListPane content) — Task 9.
   - Goal 4 (DetailPanel header + tabs + outlet) — Task 8.
   - Goal 5 (URL routing) — Task 10.
   - Goal 6 (CreateSheet) — Task 4.
   - Goal 7 (ArchiveDialog) — Task 3.
   - Goal 8 (sub-fields inlined) — Tasks 5/6/7 (tab implementations) + Task 11 (deletion).
   - Goal 9 (`p-6` removal) — Task 10 Step 4.
   - Goal 10 (no new RPCs) — verified во всех task'ах (только existing RPC names).
   - Test plan unit (7 test files) — Tasks 3-9 (each TDD task создаёт parity test file).

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные. PR # — это ожидаемый TBD до `gh pr create`.

3. **Type / naming consistency**:
   - Hook names `useAgencyList`/`useAgencyDetail` — совпадают везде.
   - Component names `AgencyListPage`/`AgencyDetailRoute`/`AgencyDetailEmpty`/`AgencyDetailPanel`/`AgencyBrandingTab`/etc — совпадают.
   - RPC names и parameter names — соответствуют existing migrations:
     - `list_all_agencies` (no params)
     - `get_agency_full(p_id)`
     - `create_agency(p_name, p_platform_id, p_admin_ids)`
     - `archive_agency(p_agency_id)`
     - `update_agency_branding(p_id, p_logo_url, p_contacts, p_access_login, p_access_password, p_notes)`
     - `assign_admin_to_agency(p_admin_id, p_agency_id)`
     - `remove_admin_from_agency(p_admin_id, p_agency_id)`
     - `list_agency_admins(p_agency_id)`
   - Outlet context shape — `{ agency, reload }` для tabs; `{ rows, reload }` для page-level Outlet — единообразно.
   - Route paths — `/admin/agencies/:agencyId/{branding,contacts,admins}` — единообразно.

4. **Out-of-scope чистота**: ни одна задача не трогает `PlatformsSection` (это 7-platforms). Никаких новых migrations. Никаких изменений в `/staff`, `/clients`, `/teams`, `/notifications`.

5. **Order dependencies**: Tasks 1→11 build в правильном порядке. Task 11 (deletion) requires Task 10 (App.jsx wiring change) выполнен первым — иначе build break. Task 10 requires Tasks 1-9 для импорта новых компонентов.

6. **Tests are real, not mocked-only**: Tab tests проверяют actual save flow (RPC call + args); ListPage test проверяет filter/search behaviour реальным изменением state.
