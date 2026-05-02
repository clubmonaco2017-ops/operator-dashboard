# Admin Section Redesign — Subplan 7-platforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести `/admin/platforms` с card-grid + legacy `<Modal>` на `MasterDetailLayout` + URL-tabs (Бренд / Контакты), с DS-перекраской и миграцией overlay'ев на shadcn `<Sheet>` для Create + `<Dialog>` для Delete (hard delete, не archive).

**Architecture:** Mirror архитектуры 7-agencies с двумя отличиями: (1) **2 tabs вместо 3** (Бренд + Контакты, без Admins — платформы не имеют admin assignments); (2) **Hard delete** через shadcn `<Dialog>` вместо archive Switch — платформы инфраструктурные, soft archive overkill, FK constraint защищает от случайного удаления связной платформы. **REST endpoint остаётся** (`api/admin/platforms` action-based) — НЕ мигрируем на RPC. Используем `adminFetch` обёртку через тонкий `platformApi(action, params)` lib.

**Tech Stack:** React 19 + Vite + Vitest + React Testing Library + Tailwind CSS v4 + shadcn/ui (`<Sheet>`, `<Dialog>`, `<Tabs>`, `<Button>`, `<Skeleton>`) + raw HTML inputs/selects/textareas + lucide-react (`ArrowLeft`, `MousePointer2`, `Server`, `Eye`/`EyeOff`, `ImagePlus`, `Loader2`, `X`, `Plus`) + react-router-dom v6 (nested routes + Outlet + useNavigate + useLocation + useOutletContext + useParams) + `adminFetch` lib (existing).

**Reference patterns (read before coding):**
- `src/pages/AgencyListPage.jsx` — page-level shell pattern (master-detail + ListPane + create state + outlet context)
- `src/components/agencies/AgencyListItem.jsx` — list item visual + pluralize helper
- `src/components/agencies/AgencyDetailPanel.jsx` — detail header + tabs nav + outlet context
- `src/components/agencies/AgencyBrandingTab.jsx` — logo upload pattern (`useRef + button onClick → input.click()`), eye toggle, Cmd+Enter
- `src/components/agencies/AgencyContactsTab.jsx` — multi-contact editor, add/remove cards
- `src/components/agencies/CreateAgencySlideOut.jsx` — Sheet form pattern
- `src/components/agencies/ArchiveAgencyDialog.jsx` — Dialog confirm pattern (для DeletePlatformDialog mirror)
- `src/lib/adminFetch.js` — existing wrapper (`adminFetch(url, body)` returns `{ data, error }`)
- `api/admin/platforms.js` — existing REST endpoint (actions: list/create/update/delete)

**Spec:** [`docs/superpowers/specs/2026-05-02-admin-section-redesign-platforms-design.md`](../specs/2026-05-02-admin-section-redesign-platforms-design.md)

**Branching:** Feature branch `feat/subplan-7-platforms` off main. Worktree at `.claude/worktrees/feat-subplan-7-platforms`.

---

## File Structure

**Created (15 source files + 6 test files):**
- `src/lib/platforms.js`
- `src/hooks/usePlatformList.js`
- `src/hooks/usePlatformDetail.js`
- `src/pages/PlatformListPage.jsx`
- `src/pages/PlatformListPage.test.jsx`
- `src/components/platforms/PlatformList.jsx`
- `src/components/platforms/PlatformListItem.jsx`
- `src/components/platforms/EmptyZero.jsx`
- `src/components/platforms/EmptyFilter.jsx`
- `src/components/platforms/DetailEmptyHint.jsx`
- `src/components/platforms/PlatformDetailPanel.jsx`
- `src/components/platforms/PlatformDetailPanel.test.jsx`
- `src/components/platforms/PlatformBrandingTab.jsx`
- `src/components/platforms/PlatformBrandingTab.test.jsx`
- `src/components/platforms/PlatformContactsTab.jsx`
- `src/components/platforms/PlatformContactsTab.test.jsx`
- `src/components/platforms/CreatePlatformSlideOut.jsx`
- `src/components/platforms/CreatePlatformSlideOut.test.jsx`
- `src/components/platforms/DeletePlatformDialog.jsx`
- `src/components/platforms/DeletePlatformDialog.test.jsx`

**Modified:**
- `src/App.jsx` — заменить `<Route path="platforms/*" element={<PlatformsSection />} />` на nested route block; импорты.

**Deleted:**
- `src/sections/PlatformsSection.jsx` (407 LOC).

---

## Task 0: Pre-flight & worktree

**Files:** none (read-only checks + branch setup)

- [ ] **Step 1: Verify clean main**

```bash
cd /Users/artemsaskin/Work/operator-dashboard
git status
git log --oneline -3
```

Expected: clean working tree, top of log is the latest squash commit (PR #64 merge of 7-agencies).

- [ ] **Step 2: Create worktree + feature branch**

```bash
git worktree add .claude/worktrees/feat-subplan-7-platforms -b feat/subplan-7-platforms
cd .claude/worktrees/feat-subplan-7-platforms
cp /Users/artemsaskin/Work/operator-dashboard/.env.local .env.local
cp -r /Users/artemsaskin/Work/operator-dashboard/.vercel .vercel 2>/dev/null
rm -rf .vercel/output 2>/dev/null
npm ci
```

Expected: worktree created, deps installed, .env + .vercel/project.json готовы для preview deploy.

- [ ] **Step 3: Pre-flight grep — verify legacy file consumer**

```bash
grep -rn "PlatformsSection" src/ --include="*.jsx" --include="*.js"
```

Expected:
- `src/sections/PlatformsSection.jsx` (definition)
- `src/App.jsx` (single import + route)

Если есть другие consumers — остановиться и обсудить.

- [ ] **Step 4: Pre-flight grep — Modal/InputField/TextArea/Toast usage outside PlatformsSection**

```bash
grep -rn "from.*['\"].*components/ui['\"]\\b" src/ --include="*.jsx" --include="*.js"
grep -rn "import.*\\(Modal\\|InputField\\|TextArea\\|Toast\\).*from.*['\"].*components/ui" src/ --include="*.jsx" --include="*.js"
```

Expected: только `src/sections/PlatformsSection.jsx` импортирует из `components/ui` (Modal, InputField, TextArea, Toast). После удаления PlatformsSection эти legacy primitives станут orphans (cleanup deferred — отметим в memory).

Если другие consumers — остановиться, потому что spec предполагает что PlatformsSection — последний.

- [ ] **Step 5: Baseline tests + build**

```bash
npm run test:run
npm run build
```

Expected baseline: те же 19 pre-existing failures (LoginPage 10 + UserMenuDropdown 4 + CreateStaffSlideOut 3 + AgencyFilterDropdown 1 + defaultPermissions 1) + 5 file-level crashes. После наших изменений набор failures должен остаться **тем же** — никаких новых регрессов.

Build должен быть clean.

---

## Task 1: `platformApi` lib + hooks (`usePlatformList` + `usePlatformDetail`)

**Files:**
- Create: `src/lib/platforms.js`
- Create: `src/hooks/usePlatformList.js`
- Create: `src/hooks/usePlatformDetail.js`

Тонкая обёртка над REST endpoint + два hook'а. Тесты не нужны (hooks тестируются через consumer pages).

- [ ] **Step 1: Create `src/lib/platforms.js`** with this exact content:

```js
import { adminFetch } from './adminFetch.js'

/**
 * Тонкая обёртка над REST endpoint /api/admin/platforms.
 * Action-based pattern: list/create/update/delete.
 *
 * Returns { data, error } per adminFetch contract.
 */
export function platformApi(action, params = {}) {
  return adminFetch('/api/admin/platforms', { action, ...params })
}
```

- [ ] **Step 2: Create `src/hooks/usePlatformList.js`** with this exact content:

```js
import { useCallback, useEffect, useState } from 'react'
import { platformApi } from '../lib/platforms.js'

/**
 * Wraps `platformApi('list')`. Returns rows + loading/error/reload.
 * REST sorts by created_at ASC; client re-sort by name (ru) для предсказуемого list'а.
 */
export function usePlatformList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await platformApi('list')
    if (err) {
      setError(err.message ?? String(err))
      setRows([])
    } else {
      setRows(
        [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
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

- [ ] **Step 3: Create `src/hooks/usePlatformDetail.js`** with this exact content:

```js
import { useMemo } from 'react'

/**
 * Lookup-функция: ищет платформу по id среди уже загруженных rows.
 * Не делает отдельный fetch — REST endpoint не имеет get_one action.
 * После save tabs вызывают reload parent'а → fresh rows → fresh lookup.
 */
export function usePlatformDetail(rows, platformId) {
  return useMemo(() => {
    if (!platformId) return null
    return rows.find((r) => r.id === platformId) ?? null
  }, [rows, platformId])
}
```

- [ ] **Step 4: Sanity build**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms.js src/hooks/usePlatformList.js src/hooks/usePlatformDetail.js
git commit -m "feat(platforms): add platformApi lib + usePlatformList + usePlatformDetail hooks"
```

---

## Task 2: List-pane primitives

**Files:**
- Create: `src/components/platforms/PlatformListItem.jsx`
- Create: `src/components/platforms/PlatformList.jsx`
- Create: `src/components/platforms/EmptyZero.jsx`
- Create: `src/components/platforms/EmptyFilter.jsx`
- Create: `src/components/platforms/DetailEmptyHint.jsx`

5 visual primitives. Тестов нет (mirror agencies — visual primitives без логики).

- [ ] **Step 1: Create `PlatformListItem.jsx`** with this exact content:

```jsx
import { Link } from 'react-router-dom'

/**
 * Single row in master-list. Mirror AgencyListItem visual:
 * round avatar 36px (logo с initial fallback) + name + contacts subtitle.
 * Active = vertical primary accent bar + bg-muted.
 */
export function PlatformListItem({ platform, isActive }) {
  const initial = platform.name?.[0]?.toUpperCase() ?? '?'
  const contactsLabel = formatContacts(platform.contacts)

  return (
    <Link
      to={`/admin/platforms/${platform.id}`}
      aria-current={isActive ? 'true' : undefined}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
    >
      {platform.logo_url ? (
        <img
          src={platform.logo_url}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full bg-muted object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {platform.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{contactsLabel}</p>
      </div>
    </Link>
  )
}

function formatContacts(contacts) {
  const n = Array.isArray(contacts) ? contacts.length : 0
  return pluralize(n, 'контакт', 'контакта', 'контактов')
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

- [ ] **Step 2: Create `PlatformList.jsx`** with this exact content:

```jsx
import { PlatformListItem } from './PlatformListItem.jsx'

export function PlatformList({ rows, selectedId }) {
  return (
    <ul className="flex flex-col py-1" aria-label="Список платформ">
      {rows.map((p) => (
        <li key={p.id}>
          <PlatformListItem platform={p} isActive={p.id === selectedId} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Create `EmptyZero.jsx`** with this exact content:

```jsx
import { Server } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyZero({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <Server className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="mb-4 text-sm text-muted-foreground">Платформ пока нет</p>
      <Button size="sm" onClick={onCreate}>+ Создать первую</Button>
    </div>
  )
}
```

- [ ] **Step 4: Create `EmptyFilter.jsx`** with this exact content:

```jsx
import { Button } from '@/components/ui/button'

export function EmptyFilter({ onClearSearch }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="mb-3 text-sm text-muted-foreground">Ничего не найдено</p>
      <Button variant="outline" size="sm" onClick={onClearSearch}>
        Очистить поиск
      </Button>
    </div>
  )
}
```

- [ ] **Step 5: Create `DetailEmptyHint.jsx`** with this exact content:

```jsx
import { MousePointer2 } from 'lucide-react'

/**
 * Хинт в detail-панели когда master содержит данные, но платформа не выбрана.
 * Mirror стиля clients/teams/staff/agencies DetailEmptyHint.
 */
export function DetailEmptyHint({ error = null }) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-[var(--fg4)]">
        <MousePointer2 size={22} />
      </div>
      <h2 className="text-base font-semibold text-foreground">
        Выберите платформу слева
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Бренд и контакты платформы откроются в этой панели.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Sanity build**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/platforms/
git commit -m "feat(platforms): add list-pane primitives (item, list, empties, hint)"
```

---

## Task 3: `DeletePlatformDialog` — TDD

**Files:**
- Create: `src/components/platforms/DeletePlatformDialog.jsx`
- Create: `src/components/platforms/DeletePlatformDialog.test.jsx`

shadcn `<Dialog>` confirmation для hard delete. Reference: `src/components/agencies/ArchiveAgencyDialog.jsx`.

- [ ] **Step 1: Write failing test** — create `src/components/platforms/DeletePlatformDialog.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { DeletePlatformDialog } from './DeletePlatformDialog.jsx'
import { platformApi } from '../../lib/platforms.js'

const platform = { id: 'p-1', name: 'PRIME' }

beforeEach(() => {
  platformApi.mockReset()
})

describe('DeletePlatformDialog', () => {
  it('calls platformApi delete on confirm', async () => {
    platformApi.mockResolvedValueOnce({ data: { success: true }, error: null })
    const onDeleted = vi.fn()
    render(
      <DeletePlatformDialog platform={platform} onClose={() => {}} onDeleted={onDeleted} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Удалить/i }))
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('delete', { id: 'p-1' })
    })
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('shows FK error inline on REST failure', async () => {
    platformApi.mockResolvedValueOnce({
      data: null,
      error: { message: 'foreign key violation: agencies still reference this platform' },
    })
    render(
      <DeletePlatformDialog platform={platform} onClose={() => {}} onDeleted={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Удалить/i }))
    await waitFor(() => {
      expect(screen.getByText(/foreign key violation/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests — expect 2 failed (Cannot find module)**

```bash
npm run test:run -- src/components/platforms/DeletePlatformDialog.test.jsx
```

- [ ] **Step 3: Implement `DeletePlatformDialog.jsx`** with this exact content:

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
import { platformApi } from '../../lib/platforms.js'

export function DeletePlatformDialog({ platform, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const confirm = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await platformApi('delete', { id: platform.id })
    setSubmitting(false)
    if (err) {
      setError(err.message ?? String(err))
      return
    }
    onDeleted()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить платформу?</DialogTitle>
          <DialogDescription>
            «{platform.name}» будет удалена безвозвратно. Если у платформы есть привязанные
            агентства — операция отклонится FK constraint'ом.
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
            {submitting ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Run tests — expect 2 passed**

```bash
npm run test:run -- src/components/platforms/DeletePlatformDialog.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/platforms/DeletePlatformDialog.jsx \
        src/components/platforms/DeletePlatformDialog.test.jsx
git commit -m "feat(platforms): add DeletePlatformDialog (shadcn Dialog + REST delete)"
```

---

## Task 4: `CreatePlatformSlideOut` — TDD

**Files:**
- Create: `src/components/platforms/CreatePlatformSlideOut.jsx`
- Create: `src/components/platforms/CreatePlatformSlideOut.test.jsx`

shadcn `<Sheet side="right">` с form: name (required) + logo upload (optional). Без admins, без platform select. Reference: `src/components/agencies/CreateAgencySlideOut.jsx`.

- [ ] **Step 1: Write failing test** — create `src/components/platforms/CreatePlatformSlideOut.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { CreatePlatformSlideOut } from './CreatePlatformSlideOut.jsx'
import { platformApi } from '../../lib/platforms.js'

beforeEach(() => {
  platformApi.mockReset()
})

function renderSlideOut(props = {}) {
  return render(
    <MemoryRouter>
      <CreatePlatformSlideOut onClose={() => {}} onCreated={() => {}} {...props} />
    </MemoryRouter>,
  )
}

describe('CreatePlatformSlideOut', () => {
  it('disables submit when name empty', () => {
    renderSlideOut()
    const btn = screen.getByRole('button', { name: /Создать/i })
    expect(btn).toBeDisabled()
  })

  it('calls platformApi create with correct payload on submit', async () => {
    platformApi.mockResolvedValueOnce({
      data: { id: 'new-platform-uuid', name: 'New Platform' },
      error: null,
    })
    const onCreated = vi.fn()
    renderSlideOut({ onCreated })
    fireEvent.change(screen.getByLabelText(/Название/i), {
      target: { value: 'New Platform' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('create', {
        name: 'New Platform',
        logo_url: null,
        contacts: [],
        access_login: null,
        access_password: null,
        notes: null,
      })
    })
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-platform-uuid'))
  })

  it('shows error inline on REST failure', async () => {
    platformApi.mockResolvedValueOnce({ data: null, error: { message: 'duplicate name' } })
    renderSlideOut()
    fireEvent.change(screen.getByLabelText(/Название/i), {
      target: { value: 'Dup' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Создать/i }))
    await waitFor(() => {
      expect(screen.getByText(/duplicate name/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failed (Cannot find module)**

```bash
npm run test:run -- src/components/platforms/CreatePlatformSlideOut.test.jsx
```

- [ ] **Step 3: Implement `CreatePlatformSlideOut.jsx`** with this exact content:

```jsx
import { useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { adminFetch } from '../../lib/adminFetch.js'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

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

export function CreatePlatformSlideOut({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const canSubmit = name.trim().length > 0 && !submitting

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadLogo(file)
      setLogoUrl(url)
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await platformApi('create', {
      name: name.trim(),
      logo_url: logoUrl || null,
      contacts: [],
      access_login: null,
      access_password: null,
      notes: null,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message ?? String(err))
      return
    }
    onCreated(data?.id)
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(e)
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Новая платформа</SheetTitle>
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

          <div>
            <span className="block mb-1 text-sm font-medium">Логотип (опционально)</span>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-12 max-w-24 rounded-lg border border-border object-contain"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || submitting}
              >
                {uploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {uploading ? 'Загрузка…' : 'Выбрать файл'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleLogoUpload(e)
                  e.target.value = ''
                }}
                className="hidden"
                disabled={uploading || submitting}
              />
            </div>
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

- [ ] **Step 4: Run tests — expect 3 passed**

```bash
npm run test:run -- src/components/platforms/CreatePlatformSlideOut.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/platforms/CreatePlatformSlideOut.jsx \
        src/components/platforms/CreatePlatformSlideOut.test.jsx
git commit -m "feat(platforms): add CreatePlatformSlideOut (shadcn Sheet + REST create)"
```

---

## Task 5: `PlatformBrandingTab` — TDD

**Files:**
- Create: `src/components/platforms/PlatformBrandingTab.jsx`
- Create: `src/components/platforms/PlatformBrandingTab.test.jsx`

Tab content для брендинга: logo upload + access login/password (с show/hide) + notes. Reference: `src/components/agencies/AgencyBrandingTab.jsx`. **Critical difference:** REST `update` action не поддерживает partial-update — передаём ВСЕ поля, contacts/name берём unchanged из platform context.

- [ ] **Step 1: Write failing test** — create `src/components/platforms/PlatformBrandingTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { PlatformBrandingTab } from './PlatformBrandingTab.jsx'
import { platformApi } from '../../lib/platforms.js'

const platform = {
  id: 'p-1',
  name: 'PRIME',
  logo_url: 'https://example.com/logo.png',
  contacts: [{ name: 'Joe', email: 'joe@x.com' }],
  access_login: 'login1',
  access_password: 'pw1',
  notes: 'note1',
}

function renderWithContext(ctxPlatform = platform) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ platform: ctxPlatform, reload: vi.fn() }} />}>
          <Route path="/" element={<PlatformBrandingTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
})

describe('PlatformBrandingTab', () => {
  it('hydrates form fields from outlet context', () => {
    renderWithContext()
    expect(screen.getByLabelText(/Логин/i)).toHaveValue('login1')
    expect(screen.getByPlaceholderText(/Дополнительная информация/i)).toHaveValue('note1')
  })

  it('disables Save when not dirty', () => {
    renderWithContext()
    const btn = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    expect(btn).toBeDisabled()
  })

  it('calls platformApi update with full payload (contacts/name unchanged) on save', async () => {
    platformApi.mockResolvedValueOnce({ data: {}, error: null })
    renderWithContext()
    fireEvent.change(screen.getByLabelText(/Логин/i), { target: { value: 'login2' } })
    const btn = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(btn).not.toBeDisabled())
    fireEvent.click(btn)
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('update', expect.objectContaining({
        id: 'p-1',
        name: 'PRIME',                  // unchanged from context
        contacts: platform.contacts,     // unchanged from context
        access_login: 'login2',          // new value
      }))
    })
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failed (Cannot find module)**

```bash
npm run test:run -- src/components/platforms/PlatformBrandingTab.test.jsx
```

- [ ] **Step 3: Implement `PlatformBrandingTab.jsx`** with this exact content:

```jsx
import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Eye, EyeOff, ImagePlus, Loader2 } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { adminFetch } from '../../lib/adminFetch.js'
import { Button } from '@/components/ui/button'

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

const initialFor = (p) => ({
  logo_url: p?.logo_url ?? '',
  access_login: p?.access_login ?? '',
  access_password: p?.access_password ?? '',
  notes: p?.notes ?? '',
})

export function PlatformBrandingTab() {
  const { platform, reload } = useOutletContext()
  const [form, setForm] = useState(() => initialFor(platform))
  const [dirty, setDirty] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setForm(initialFor(platform))
    setDirty(false)
    setError(null)
  }, [platform.id])

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
    setForm(initialFor(platform))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    // REST update требует full payload; contacts + name берём unchanged из platform.
    const { error: err } = await platformApi('update', {
      id: platform.id,
      name: platform.name,
      contacts: platform.contacts ?? [],
      logo_url: form.logo_url || null,
      access_login: form.access_login || null,
      access_password: form.access_password || null,
      notes: form.notes || null,
    })
    setSaving(false)
    if (err) {
      setError(err.message ?? String(err))
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || saving}
          >
            {uploading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {uploading ? 'Загрузка…' : 'Выбрать файл'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              handleLogoUpload(e)
              e.target.value = ''
            }}
            className="hidden"
            disabled={uploading || saving}
          />
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

- [ ] **Step 4: Run tests — expect 3 passed**

```bash
npm run test:run -- src/components/platforms/PlatformBrandingTab.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/platforms/PlatformBrandingTab.jsx \
        src/components/platforms/PlatformBrandingTab.test.jsx
git commit -m "feat(platforms): add PlatformBrandingTab (logo + access + notes, full-payload save)"
```

---

## Task 6: `PlatformContactsTab` — TDD

**Files:**
- Create: `src/components/platforms/PlatformContactsTab.jsx`
- Create: `src/components/platforms/PlatformContactsTab.test.jsx`

Multi-contact editor. Reference: `src/components/agencies/AgencyContactsTab.jsx`. **Critical difference:** save full payload, branding+name берём unchanged.

- [ ] **Step 1: Write failing test** — create `src/components/platforms/PlatformContactsTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))

import { PlatformContactsTab } from './PlatformContactsTab.jsx'
import { platformApi } from '../../lib/platforms.js'

const platformWithOne = {
  id: 'p-1',
  name: 'PRIME',
  logo_url: 'logo.png',
  contacts: [{ name: 'Иван', role: 'Менеджер', phone: '+7', email: '', telegram: '' }],
  access_login: 'l',
  access_password: 'p',
  notes: 'n',
}

function renderWith(ctxPlatform) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<Outlet context={{ platform: ctxPlatform, reload: vi.fn() }} />}>
          <Route path="/" element={<PlatformContactsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
})

describe('PlatformContactsTab', () => {
  it('renders existing contacts hydrated from outlet', () => {
    renderWith(platformWithOne)
    expect(screen.getByDisplayValue('Иван')).toBeInTheDocument()
  })

  it('add and remove contact buttons mutate count', () => {
    renderWith(platformWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(2)
    const removeBtns = screen.getAllByRole('button', { name: /Удалить контакт/i })
    fireEvent.click(removeBtns[0])
    expect(screen.getAllByPlaceholderText(/Имя/i)).toHaveLength(1)
  })

  it('save filters empty contacts and sends full payload (branding unchanged)', async () => {
    platformApi.mockResolvedValueOnce({ data: {}, error: null })
    renderWith(platformWithOne)
    fireEvent.click(screen.getByRole('button', { name: /Добавить контакт/i }))
    fireEvent.change(screen.getByDisplayValue('Иван'), { target: { value: 'Иван П.' } })
    const save = screen.getByRole('button', { name: /^Сохранить$|^Сохранение/i })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)
    await waitFor(() => {
      expect(platformApi).toHaveBeenCalledWith('update', expect.objectContaining({
        id: 'p-1',
        name: 'PRIME',
        logo_url: 'logo.png',
        access_login: 'l',
        access_password: 'p',
        notes: 'n',
      }))
    })
    const call = platformApi.mock.calls[0][1]
    expect(call.contacts).toHaveLength(1)
    expect(call.contacts[0].name).toBe('Иван П.')
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failed (Cannot find module)**

```bash
npm run test:run -- src/components/platforms/PlatformContactsTab.test.jsx
```

- [ ] **Step 3: Implement `PlatformContactsTab.jsx`** with this exact content:

```jsx
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Plus, X } from 'lucide-react'
import { platformApi } from '../../lib/platforms.js'
import { Button } from '@/components/ui/button'

const EMPTY_CONTACT = { name: '', role: '', phone: '', email: '', telegram: '' }

const isContactEmpty = (c) =>
  !c.name && !c.role && !c.phone && !c.email && !c.telegram

const initialFor = (p) => {
  const arr = Array.isArray(p?.contacts) ? p.contacts : []
  return arr.length ? arr.map((c) => ({ ...EMPTY_CONTACT, ...c })) : [{ ...EMPTY_CONTACT }]
}

export function PlatformContactsTab() {
  const { platform, reload } = useOutletContext()
  const [contacts, setContacts] = useState(() => initialFor(platform))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setContacts(initialFor(platform))
    setDirty(false)
    setError(null)
  }, [platform.id])

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
    setContacts(initialFor(platform))
    setDirty(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const cleaned = contacts.filter((c) => !isContactEmpty(c))
    // REST update требует full payload; branding + name берём unchanged.
    const { error: err } = await platformApi('update', {
      id: platform.id,
      name: platform.name,
      contacts: cleaned,
      logo_url: platform.logo_url ?? null,
      access_login: platform.access_login ?? null,
      access_password: platform.access_password ?? null,
      notes: platform.notes ?? null,
    })
    setSaving(false)
    if (err) {
      setError(err.message ?? String(err))
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

- [ ] **Step 4: Run tests — expect 3 passed**

```bash
npm run test:run -- src/components/platforms/PlatformContactsTab.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/platforms/PlatformContactsTab.jsx \
        src/components/platforms/PlatformContactsTab.test.jsx
git commit -m "feat(platforms): add PlatformContactsTab (multi-contact editor, full-payload save)"
```

---

## Task 7: `PlatformDetailPanel` — TDD

**Files:**
- Create: `src/components/platforms/PlatformDetailPanel.jsx`
- Create: `src/components/platforms/PlatformDetailPanel.test.jsx`

Header (back button mobile, name, contacts subtitle, Delete button) + shadcn Tabs nav (Бренд / Контакты) + `<Outlet />`. Reference: `src/components/agencies/AgencyDetailPanel.jsx`.

- [ ] **Step 1: Write failing test** — create `src/components/platforms/PlatformDetailPanel.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { PlatformDetailPanel } from './PlatformDetailPanel.jsx'

const platform = {
  id: 'p-1',
  name: 'PRIME',
  contacts: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/platforms/:platformId"
          element={
            <Outlet context={{ rows: [platform], reload: vi.fn() }} />
          }
        >
          <Route element={<PlatformDetailPanel onBack={() => {}} onChanged={() => {}} />}>
            <Route index element={<div data-testid="tab-content">empty</div>} />
            <Route path="branding" element={<div data-testid="tab-content">branding</div>} />
            <Route path="contacts" element={<div data-testid="tab-content">contacts</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlatformDetailPanel', () => {
  it('renders header with name and contacts subtitle', () => {
    renderAt('/admin/platforms/p-1/branding')
    expect(screen.getByRole('heading', { name: 'PRIME' })).toBeInTheDocument()
    expect(screen.getByText(/3 контакта/)).toBeInTheDocument()
  })

  it('renders both tabs', () => {
    renderAt('/admin/platforms/p-1/branding')
    expect(screen.getByRole('tab', { name: /Бренд/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Контакты/i })).toBeInTheDocument()
  })

  it('renders child route content via Outlet', () => {
    renderAt('/admin/platforms/p-1/contacts')
    expect(screen.getByTestId('tab-content')).toHaveTextContent('contacts')
  })
})
```

- [ ] **Step 2: Run tests — expect 3 failed (Cannot find module)**

```bash
npm run test:run -- src/components/platforms/PlatformDetailPanel.test.jsx
```

- [ ] **Step 3: Implement `PlatformDetailPanel.jsx`** with this exact content:

```jsx
import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlatformDetail } from '../../hooks/usePlatformDetail.js'
import { DeletePlatformDialog } from './DeletePlatformDialog.jsx'
import { DetailEmptyHint } from './DetailEmptyHint.jsx'

const TABS = [
  { value: 'branding', label: 'Бренд' },
  { value: 'contacts', label: 'Контакты' },
]

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

export function PlatformDetailPanel({ onBack, onChanged }) {
  const { platformId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const { rows, reload: reloadList } = useOutletContext()
  const platform = usePlatformDetail(rows, platformId)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const segments = location.pathname.split('/')
  const lastSegment = segments[segments.length - 1]
  const currentTab = TABS.some((t) => t.value === lastSegment) ? lastSegment : 'branding'

  if (!platform) {
    return <DetailEmptyHint error="Платформа не найдена" />
  }

  const handleAfterChange = () => {
    reloadList()
    onChanged?.()
  }

  const contactsCount = Array.isArray(platform.contacts) ? platform.contacts.length : 0

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
              <h1 className="truncate text-xl font-semibold">{platform.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {pluralize(contactsCount, 'контакт', 'контакта', 'контактов')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            Удалить
          </Button>
        </div>

        <Tabs
          value={currentTab}
          onValueChange={(v) => navigate(`/admin/platforms/${platformId}/${v}`)}
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
        <Outlet context={{ platform, reload: handleAfterChange }} />
      </main>

      {deleteOpen && (
        <DeletePlatformDialog
          platform={platform}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false)
            handleAfterChange()
            navigate('/admin/platforms')
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — expect 3 passed**

```bash
npm run test:run -- src/components/platforms/PlatformDetailPanel.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/platforms/PlatformDetailPanel.jsx \
        src/components/platforms/PlatformDetailPanel.test.jsx
git commit -m "feat(platforms): add PlatformDetailPanel (header + 2 tabs + Outlet + delete)"
```

---

## Task 8: `PlatformListPage` — TDD (integration)

**Files:**
- Create: `src/pages/PlatformListPage.jsx`
- Create: `src/pages/PlatformListPage.test.jsx`

Page-level shell. Exports `PlatformListPage`, `PlatformDetailRoute`, `PlatformDetailEmpty`. Reference: `src/pages/AgencyListPage.jsx`.

- [ ] **Step 1: Write failing test** — create `src/pages/PlatformListPage.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}))

import { PlatformListPage, PlatformDetailEmpty } from './PlatformListPage.jsx'
import { platformApi } from '../lib/platforms.js'

const mockData = [
  { id: 'p-1', name: 'AFA',    logo_url: null, contacts: [{ name: 'a' }] },
  { id: 'p-2', name: 'PRIME',  logo_url: null, contacts: [] },
]

function renderPage(initialPath = '/admin/platforms') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/platforms" element={<PlatformListPage />}>
          <Route index element={<PlatformDetailEmpty />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  platformApi.mockReset()
  platformApi.mockImplementation((action) => {
    if (action === 'list') {
      return Promise.resolve({ data: mockData, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
})

describe('PlatformListPage', () => {
  it('renders title with count and platforms sorted by name', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('AFA')).toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
  })

  it('search filters list by name', async () => {
    renderPage()
    await waitFor(() => screen.getByText('AFA'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'prime' } })
    await waitFor(() => {
      expect(screen.queryByText('AFA')).not.toBeInTheDocument()
    })
    expect(screen.getByText('PRIME')).toBeInTheDocument()
  })

  it('shows EmptyFilter when search filters everything out', async () => {
    renderPage()
    await waitFor(() => screen.getByText('AFA'))
    fireEvent.change(screen.getByPlaceholderText(/Поиск/i), { target: { value: 'zzz' } })
    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument()
    })
  })

  it('renders detail empty hint when no platform selected', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Выберите платформу/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests — expect 4 failed**

```bash
npm run test:run -- src/pages/PlatformListPage.test.jsx
```

- [ ] **Step 3: Implement `PlatformListPage.jsx`** with this exact content:

```jsx
import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { usePlatformList } from '../hooks/usePlatformList.js'
import { PlatformList } from '../components/platforms/PlatformList.jsx'
import { PlatformDetailPanel } from '../components/platforms/PlatformDetailPanel.jsx'
import { CreatePlatformSlideOut } from '../components/platforms/CreatePlatformSlideOut.jsx'
import { EmptyZero } from '../components/platforms/EmptyZero.jsx'
import { EmptyFilter } from '../components/platforms/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/platforms/DetailEmptyHint.jsx'

export function PlatformListPage() {
  const navigate = useNavigate()
  const { platformId } = useParams()
  const { rows, loading, error, reload } = usePlatformList()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((p) => p.name.toLowerCase().includes(q))
  }, [rows, search])

  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Платформы
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
      ariaLabel="Поиск платформ"
    />
  )

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
    <EmptyFilter onClearSearch={() => setSearch('')} />
  ) : (
    <PlatformList rows={filtered} selectedId={platformId ?? null} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={null}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
        listLabel="Список платформ"
        detailEmpty={!platformId}
        detailLabel="Платформа"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreatePlatformSlideOut
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`/admin/platforms/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — empty hint when no platform selected.
export function PlatformDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls platformId from URL, passes reload from parent context.
export function PlatformDetailRoute() {
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <PlatformDetailPanel
      onBack={() => navigate('/admin/platforms')}
      onChanged={reload}
    />
  )
}
```

- [ ] **Step 4: Run tests — expect 4 passed**

```bash
npm run test:run -- src/pages/PlatformListPage.test.jsx
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/PlatformListPage.jsx src/pages/PlatformListPage.test.jsx
git commit -m "feat(platforms): add PlatformListPage (master-detail integration with search/create)"
```

---

## Task 9: App.jsx routing change

**Files:**
- Modify: `src/App.jsx`

Wire `PlatformListPage` через nested routes (replace `<Route path="platforms/*" element={<PlatformsSection />} />`).

- [ ] **Step 1: Read current App.jsx**

```bash
grep -n "PlatformsSection\|PlatformListPage\|/admin/platforms" src/App.jsx
```

Запомнить позицию импорта `PlatformsSection` и блока route.

- [ ] **Step 2: Replace `PlatformsSection` import with new exports**

В `src/App.jsx`:

Удалить строку:
```jsx
import PlatformsSection from './sections/PlatformsSection'
```

Добавить (рядом с другими page-импортами):
```jsx
import {
  PlatformListPage,
  PlatformDetailRoute,
  PlatformDetailEmpty,
} from './pages/PlatformListPage.jsx'
import { PlatformBrandingTab } from './components/platforms/PlatformBrandingTab.jsx'
import { PlatformContactsTab } from './components/platforms/PlatformContactsTab.jsx'
```

- [ ] **Step 3: Replace platforms route block**

Найти:
```jsx
<Route path="platforms/*" element={<PlatformsSection />} />
```

Заменить на:
```jsx
<Route path="platforms" element={<PlatformListPage />}>
  <Route index element={<PlatformDetailEmpty />} />
  <Route path=":platformId" element={<PlatformDetailRoute />}>
    <Route index element={<Navigate to="branding" replace />} />
    <Route path="branding" element={<PlatformBrandingTab />} />
    <Route path="contacts" element={<PlatformContactsTab />} />
  </Route>
</Route>
```

- [ ] **Step 4: Run full test suite**

```bash
npm run test:run
```

Expected: те же baseline 19 pre-existing failures + 5 AdminShell + ~25 agencies passes (cumulative из main) + ~17 новых platforms passes. Никаких новых регрессий.

- [ ] **Step 5: Build sanity**

```bash
npm run build 2>&1 | tail -3
```

Expected: clean. Это критерий — старый PlatformsSection всё ещё существует, но Vite tree-shake'ит его (App.jsx больше не импортирует).

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat(admin): wire PlatformListPage nested routes"
```

---

## Task 10: Delete legacy `PlatformsSection`

**Files:**
- Delete: `src/sections/PlatformsSection.jsx`

После Task 9 этот файл — orphan. Удаляем.

- [ ] **Step 1: Final grep — verify no consumers remain**

```bash
grep -rn "PlatformsSection" src/ --include="*.jsx" --include="*.js"
```

Expected: только `src/sections/PlatformsSection.jsx` (definition).

- [ ] **Step 2: Delete file**

```bash
git rm src/sections/PlatformsSection.jsx
```

- [ ] **Step 3: Build + test sanity**

```bash
npm run build 2>&1 | tail -3
npm run test:run 2>&1 | tail -8
```

Expected:
- Build: clean.
- Tests: те же passes как после Task 9.

- [ ] **Step 4: Verify Modal/InputField/TextArea/Toast — orphan?**

```bash
grep -rn "import.*\\(Modal\\|InputField\\|TextArea\\|Toast\\).*from.*['\"].*components/ui" src/ --include="*.jsx" --include="*.js"
```

Если пусто — `components/ui.jsx` (legacy) теперь содержит только orphan'ы. **НЕ удаляем в этом subplan'е** — это deferred cleanup. Записать в memory как known limitation для будущего mini-subplan'а.

Если что-то ещё импортирует — отлично, оставляем `components/ui.jsx` как есть (значит другие consumers остались).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(platforms): remove legacy PlatformsSection.jsx (407 LOC)"
```

---

## Task 11: Manual smoke test (preview deploy)

**Files:** none (runtime check)

- [ ] **Step 1: Deploy preview**

```bash
vercel
```

Expected: preview URL.

- [ ] **Step 2: Walk через сценарии в браузере**

Login as superadmin. Navigate to `/admin/platforms`.

- [ ] (a) ListPane показывает платформы (sorted by name); search фильтрует; EmptyFilter при zero.
- [ ] (b) `+ Новое` → Sheet → name + опционально logo → submit → попадаем на `/admin/platforms/<new>/branding`.
- [ ] (c) Branding tab: загрузить лого, изменить access_login, сохранить, перезагрузить — persisted.
- [ ] (d) Contacts tab: добавить контакт, заполнить, сохранить, перезагрузить — persisted; пустые отфильтрованы.
- [ ] (e) Header «Удалить» → Dialog → confirm → платформа удалена, redirect на `/admin/platforms`.
- [ ] (f) Hard delete защита: попытаться удалить платформу с привязанными агентствами → Dialog показывает FK error inline (не зачищается).
- [ ] (g) Mobile (DevTools 375px): horizontal admin tabs работают; detail full-width.
- [ ] (h) Other sections (`/admin/agencies`, `/staff`, `/clients`, `/teams`) — без регрессов.

- [ ] **Step 3: Записать результаты**

Если регресс или проблема — поправить (additional commit). Если всё ОК — Task 12.

---

## Task 12: Final validation + memory update + PR + merge + deploy

**Files:**
- Modify: `~/.claude/projects/-Users-artemsaskin-Work-operator-dashboard/memory/project_ds_rollout_roadmap.md` (memory вне репо)

- [ ] **Step 1: Final test/build/lint**

```bash
npm run test:run
npm run build
npm run lint
```

Expected:
- Tests: те же 19 pre-existing failures + ~17 новых platforms passes (cumulative ~348+ passes).
- Build: clean.
- Lint: baseline ~70 problems (могут добавиться 1-2 от новых файлов; не должно быть «error» от наших файлов).

- [ ] **Step 2: Update memory `project_ds_rollout_roadmap.md`**

Найти секцию «Subplan 7-track (admin section DS rebuild) — IN PROGRESS» и заменить:

```
**Subplan 7-track (admin section DS rebuild) — COMPLETE:**
- ~~7-shell~~ — DONE (PR #63).
- ~~7-agencies~~ — DONE (PR #64).
- ~~7-platforms~~ — DONE. PlatformListPage с MasterDetailLayout + 2 URL-tabs (branding/contacts) + Sheet for create + Dialog for delete (hard delete с FK protection). 11 новых компонентов + 2 hook'а + 1 lib + 6 test-файлов (~17 it-blocks). Удалён PlatformsSection.jsx (407 LOC, последний consumer legacy <Modal>). REST endpoint api/admin/platforms остаётся (не мигрировали на RPC). PR #<TBD>.
```

Также добавить в «Far-future» (если ещё не там):
```
- components/ui.jsx legacy primitives (Modal, InputField, TextArea, Toast) — после 7-platforms все consumers удалены. Cleanup отдельным mini-subplan'ом если эти exports никому не нужны (grep подтвердит). Низкий приоритет.
```

- [ ] **Step 3: Verify clean state**

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, ~10 коммитов на ветке.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/subplan-7-platforms
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "feat(admin): subplan 7-platforms — master-detail + 2 URL tabs + Sheet/Dialog" --body "$(cat <<'EOF'
## Summary
- `/admin/platforms` переведено на `MasterDetailLayout` + URL'ные tabs (Бренд / Контакты) + shadcn `<Sheet>` для Create + `<Dialog>` для Delete (hard delete с FK protection).
- Master pane: list-карточка-row (avatar/logo + name + «N контактов» subtitle); search; button «+ Новое». Без filter chips (нет archive state).
- Detail panel: header с name + contacts subtitle + кнопка «Удалить» destructive; tabs nav через URL.
- Удалён `src/sections/PlatformsSection.jsx` (407 LOC, последний consumer legacy `<Modal>`).
- 2 новых hook'а (usePlatformList, usePlatformDetail) + 1 lib (platformApi) + 6 test-файлов (~17 it-blocks).
- REST endpoint `api/admin/platforms` остаётся как есть (не мигрировали на RPC — scope creep, auth уже работает через `_auth.js`).

## Differences from 7-agencies
- 2 tabs вместо 3 (без Admins — платформы не имеют admin assignments)
- Hard delete через Dialog (вместо archive Switch — FK constraint защищает от случайного удаления)
- REST + adminFetch (вместо RPC supabase.rpc)
- save tabs передают full payload (REST update не поддерживает partial — name/contacts unchanged tabs берут из outlet context)

Spec: `docs/superpowers/specs/2026-05-02-admin-section-redesign-platforms-design.md`
Plan: `docs/superpowers/plans/2026-05-02-admin-section-redesign-platforms.md`

## Test plan
- [x] /admin/platforms: list pane sorted by name; search фильтрует; EmptyFilter при zero.
- [x] + Новое → Sheet → submit → попадаем на /admin/platforms/<new>/branding.
- [x] Branding/Contacts tabs — каждый сохраняет full payload через REST update; unchanged поля берутся из outlet context.
- [x] Hard delete: Dialog → confirm → удалено + redirect; FK error inline если есть привязанные агентства.
- [x] Mobile (375px): horizontal admin tabs работают; detail full-width.
- [x] /admin/agencies — без регрессов.
- [x] npm run test:run: ~17 новых passes; pre-existing 19 failures без изменений.
- [x] Build clean; lint baseline (без новых ошибок от наших файлов).

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
git worktree remove .claude/worktrees/feat-subplan-7-platforms
git branch -D feat/subplan-7-platforms 2>/dev/null || true
git pull --ff-only
```

- [ ] **Step 10: Production deploy**

```bash
vercel --prod
```

Expected: production deploy URL. После deploy — `/admin` визуально и архитектурно полностью унифицирован с остальным сайтом. 7-track CLOSED.

---

## Self-review (после написания плана — выполнено перед сдачей)

1. **Spec coverage** — каждый раздел spec'а покрыт задачей:
   - Goal 1 (PlatformListPage с MasterDetailLayout) — Tasks 8, 9.
   - Goal 2 (PlatformListItem visual) — Task 2.
   - Goal 3 (ListPane содержит title+search+create, без chips) — Task 8.
   - Goal 4 (DetailPanel header + tabs + Outlet) — Task 7.
   - Goal 5 (URL routing) — Task 9.
   - Goal 6 (CreateSheet) — Task 4.
   - Goal 7 (DeleteDialog) — Task 3.
   - Goal 8 (no new RPC, REST stays) — verified across all tasks (только `platformApi` lib, no supabase.rpc).
   - Goal 9 (delete PlatformsSection) — Task 10.
   - Test plan unit (6 test files) — Tasks 3, 4, 5, 6, 7, 8.

2. **Placeholder scan** — нет TBD/«implement later». Все code-блоки полные. PR # — это ожидаемый TBD до `gh pr create`.

3. **Type / naming consistency**:
   - Hook names `usePlatformList`/`usePlatformDetail` — совпадают везде.
   - Component names `PlatformListPage`/`PlatformDetailRoute`/`PlatformDetailEmpty`/`PlatformDetailPanel`/`PlatformBrandingTab`/`PlatformContactsTab`/`CreatePlatformSlideOut`/`DeletePlatformDialog` — совпадают.
   - REST action names и params: `list/create/update/delete` — соответствуют `api/admin/platforms.js` actions.
   - Outlet context shape — `{ platform, reload }` для tabs; `{ rows, reload }` для page-level Outlet — единообразно.
   - Route paths — `/admin/platforms/:platformId/{branding,contacts}` — единообразно.
   - `platformApi(action, params)` lib — используется во всех Tasks 3-8 одинаково.

4. **Out-of-scope чистота**: ни одна задача не трогает `/admin/agencies`, не делает schema migrations, не трогает auth.

5. **Order dependencies**: Tasks 1→10 build в правильном порядке. Task 10 (deletion) requires Task 9 (App.jsx wiring) выполнен первым — иначе build break (старый PlatformsSection импорт в App.jsx). Task 9 requires Tasks 1-8 для импорта новых компонентов.

6. **Tests are real, not mocked-only**: Tab tests проверяют actual save flow (REST call + payload assertions); ListPage test проверяет search behaviour реальным изменением state.
