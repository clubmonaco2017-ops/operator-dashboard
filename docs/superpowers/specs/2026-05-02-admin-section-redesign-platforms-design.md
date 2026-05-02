# Admin Section Redesign — Subplan 7-platforms Design

**Date:** 2026-05-02
**Status:** Spec — awaiting user review

## Summary

Часть 3 из 3 в редизайне `/admin`. Этот subplan переводит `/admin/platforms` с card-grid + legacy `<Modal>` на `MasterDetailLayout` + URL'ные tabs (Бренд / Контакты) + shadcn `<Sheet>` для Create + `<Dialog>` для Delete. После этого subplan'а `/admin` визуально и архитектурно полностью унифицирован с остальным сайтом (`/clients`, `/teams`, `/staff`).

Mirror архитектуры 7-agencies с двумя ключевыми отличиями:
1. **Hard delete вместо archive** (платформы — инфраструктурные сущности, soft archive overkill; FK constraint защищает от случайного удаления при наличии привязанных агентств).
2. **REST endpoint остаётся** (`api/admin/platforms` action-based) — НЕ мигрируем на RPC (scope creep + auth уже работает через `_auth.js`).

## Goals

1. `PlatformsSection` (407 LOC, card-grid + legacy `<Modal>`) → `PlatformListPage` на `MasterDetailLayout`.
2. `PlatformListItem`: avatar (logo с initial fallback) + name + subtitle «N контактов».
3. ListPane содержит: title с count, search, кнопку «+ Новое». Без filter chips (нет archive state).
4. Detail panel: header (name + «N контактов» subtitle + кнопка «Удалить») + shadcn `<Tabs>` nav (Бренд / Контакты) + `<Outlet />`.
5. URL-routing: `/admin/platforms/:id/{branding,contacts}` (default → branding).
6. `CreatePlatformSlideOut` — shadcn `<Sheet>`. Поля: name (required) + logo upload (опционально).
7. `DeletePlatformDialog` — shadcn `<Dialog>` destructive, заменяет `window.confirm` + кнопку в legacy modal'е.
8. Никаких новых RPC, никаких schema migrations. REST endpoint `api/admin/platforms` остаётся как есть.
9. Удалить `src/sections/PlatformsSection.jsx` (407 LOC, последний consumer legacy `<Modal>` из `components/ui`).

## Non-goals

- Soft archive для platforms (не нужен; hard delete с FK protection достаточно).
- Migration на RPC (REST работает, auth закрыт через `_auth.js`).
- Изменения в `api/admin/platforms.js` endpoint (signatures и actions остаются).
- Mobile-specific доработки `AdminShell` (уже сделано в 7-agencies — horizontal tabs на mobile).
- Удаление `components/ui.jsx` `<Modal>` (после удаления `PlatformsSection` это будет orphan; cleanup deferred — но grep'ом проверим что больше никто не импортирует).
- DS-перекраска базовых файлов вне platforms (`/admin/agencies` уже в 7-agencies).

## Architecture

### Routing change in `App.jsx`

**Было** (после 7-shell):
```jsx
<Route path="platforms/*" element={<PlatformsSection />} />
```

**Стало:**
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

### File Structure

**Created (15 source files + 6 test files):**
- `src/lib/platforms.js` (~25 LOC) — тонкая обёртка `platformApi(action, params)` над `adminFetch`. Returns `{ data, error }`.
- `src/hooks/usePlatformList.js` (~45 LOC) — wraps `platformApi('list')`. Returns `{ rows, loading, error, reload }`. Сортирует по `name` (REST возвращает по `created_at` — ре-сортировка на client'е).
- `src/hooks/usePlatformDetail.js` (~25 LOC) — `(rows, id) => rows.find(r => r.id === id) ?? null`. Чистая lookup-функция; не делает отдельный fetch.
- `src/pages/PlatformListPage.jsx` (~140 LOC) — page-level shell с `MasterDetailLayout`, `ListPane`, search, Sheet state. Exports `PlatformListPage`, `PlatformDetailRoute`, `PlatformDetailEmpty`.
- `src/pages/PlatformListPage.test.jsx` (~100 LOC, 4 it-blocks)
- `src/components/platforms/PlatformList.jsx` (~25 LOC)
- `src/components/platforms/PlatformListItem.jsx` (~70 LOC) — single row, avatar (logo с initial fallback) + name + contacts count.
- `src/components/platforms/EmptyZero.jsx` (~25 LOC) — `Server` icon + «Платформ пока нет» + create CTA.
- `src/components/platforms/EmptyFilter.jsx` (~25 LOC) — «Ничего не найдено» + clear search.
- `src/components/platforms/DetailEmptyHint.jsx` (~25 LOC) — `MousePointer2` icon + «Выберите платформу слева» + description (mirror agencies).
- `src/components/platforms/PlatformDetailPanel.jsx` (~110 LOC) — header (back button mobile, name, contacts subtitle, Delete button) + Tabs nav + Outlet.
- `src/components/platforms/PlatformDetailPanel.test.jsx` (~80 LOC, 3 it-blocks)
- `src/components/platforms/PlatformBrandingTab.jsx` (~180 LOC) — logo upload (`useRef + button onClick → input.click()` pattern), access login/password (eye toggle), notes, save.
- `src/components/platforms/PlatformBrandingTab.test.jsx` (~90 LOC, 3 it-blocks)
- `src/components/platforms/PlatformContactsTab.jsx` (~150 LOC) — multi-contact editor, add/remove cards, save filters empty.
- `src/components/platforms/PlatformContactsTab.test.jsx` (~90 LOC, 3 it-blocks)
- `src/components/platforms/CreatePlatformSlideOut.jsx` (~140 LOC) — shadcn `<Sheet>` form (name + logo upload).
- `src/components/platforms/CreatePlatformSlideOut.test.jsx` (~80 LOC, 3 it-blocks)
- `src/components/platforms/DeletePlatformDialog.jsx` (~70 LOC) — shadcn `<Dialog>` confirm + REST delete.
- `src/components/platforms/DeletePlatformDialog.test.jsx` (~60 LOC, 2 it-blocks)

**Modified:**
- `src/App.jsx` — заменить `<Route path="platforms/*" ...>` на nested route block; добавить новые импорты.

**Deleted:**
- `src/sections/PlatformsSection.jsx` (407 LOC).

## Component Details

### `platformApi` lib

```js
import { adminFetch } from './adminFetch.js'

export function platformApi(action, params = {}) {
  return adminFetch('/api/admin/platforms', { action, ...params })
}
```

Позволяет тестам мокать одну функцию, а не сырой `adminFetch`. Также добавляет тип-документацию через JSDoc.

### `usePlatformList`

```js
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
      // REST sorts by created_at ASC; client re-sort by name for predictable list.
      setRows([...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
  return { rows, loading, error, reload }
}
```

### `usePlatformDetail`

```js
export function usePlatformDetail(rows, platformId) {
  return useMemo(() => {
    if (!platformId) return null
    return rows.find((r) => r.id === platformId) ?? null
  }, [rows, platformId])
}
```

Lookup-функция; нет отдельного fetch (REST не имеет `get_one`-action — только `list`). После save tab вызывает `reload` parent'а → fresh rows → fresh lookup.

### `PlatformListItem` visual

```
▌ ⓟ  PRIME
     5 контактов
```

- Round avatar 36px — `<img src={logo_url}>` если есть, иначе `<div>` с initial-letter (mirror `AgencyListItem`).
- Active state: `border-l-2 border-l-primary bg-muted`.
- Subtitle: `pluralize(contacts.length, 'контакт', 'контакта', 'контактов')` — одна строка, без counters другого типа.

### `PlatformListPage` layout

```jsx
<MasterDetailLayout
  listPane={
    <ListPane
      title={<span>Платформы <span className="text-xs text-muted-foreground">{filtered.length}</span></span>}
      search={<SearchInput value={search} onChange={setSearch} placeholder="Поиск по названию…" />}
      filters={null}
      createButton={<Button size="sm" onClick={() => setCreateOpen(true)}>+ Новое</Button>}
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

{createOpen && <CreatePlatformSlideOut onClose={() => setCreateOpen(false)} onCreated={(id) => { reload(); navigate(`/admin/platforms/${id}`) }} />}
```

Filter — нет (нет archive state). Search фильтрует по name client-side. EmptyZero/EmptyFilter ветвления.

### `PlatformDetailPanel` (новый)

```jsx
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
  const currentTab = ['branding','contacts'].includes(lastSegment) ? lastSegment : 'branding'

  if (!platform) return <DetailEmptyHint error="Платформа не найдена" />

  const handleAfterChange = () => { reloadList(); onChanged?.() }

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
                {pluralize((platform.contacts ?? []).length, 'контакт', 'контакта', 'контактов')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            Удалить
          </Button>
        </div>
        <Tabs value={currentTab} onValueChange={(v) => navigate(`/admin/platforms/${platformId}/${v}`)}>
          <TabsList>
            <TabsTrigger value="branding">Бренд</TabsTrigger>
            <TabsTrigger value="contacts">Контакты</TabsTrigger>
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
          onDeleted={() => { setDeleteOpen(false); handleAfterChange(); navigate('/admin/platforms') }}
        />
      )}
    </div>
  )
}
```

### `PlatformBrandingTab` save flow

REST `update` action **не поддерживает partial-update** (передаёт все поля каждый раз). Поэтому save из branding-таба должен передавать full payload, where contacts берётся unchanged из current `platform`:

```jsx
const save = async () => {
  setSaving(true)
  setError(null)
  const { error: err } = await platformApi('update', {
    id: platform.id,
    name: platform.name,                    // unchanged
    contacts: platform.contacts ?? [],      // unchanged (из outlet context)
    logo_url: form.logo_url || null,
    access_login: form.access_login || null,
    access_password: form.access_password || null,
    notes: form.notes || null,
  })
  setSaving(false)
  if (err) { setError(err.message ?? String(err)); return }
  setDirty(false)
  reload()
}
```

`PlatformContactsTab` — аналогично, но contacts из form, остальное unchanged.

⚠ **Race condition осторожность:** если user меняет branding-таб и contacts-таб параллельно (открыл оба в разных вкладках браузера) и save'ит оба, последний save перезапишет данные первого. Acceptable для superadmin-only single-user админки. Не fix'им.

### `CreatePlatformSlideOut`

shadcn `<Sheet side="right">` с form:
- `<Label>Название</Label><Input value={name} required />`
- `<Label>Логотип</Label>` + logo upload через `useRef + button + input[type=file]` pattern (lessons learned из 7-agencies bug fix).
- Submit: `platformApi('create', { name, logo_url, contacts: [], access_login: null, access_password: null, notes: null })` → on success → response `{ data: { id, ... } }` → `onCreated(data.id)` → page navigates на `/admin/platforms/<new>`.
- Cmd/Ctrl+Enter → submit.

### `DeletePlatformDialog`

shadcn `<Dialog>`:
- Title: «Удалить платформу?»
- Description: «"{platform.name}" будет удалена безвозвратно. Если у платформы есть привязанные агентства — операция отклонится FK constraint'ом.»
- Footer: `<Button variant="outline">Отменить</Button> <Button variant="destructive">Удалить</Button>`
- Confirm: `platformApi('delete', { id: platform.id })`. На success → close + onDeleted(). На error (FK constraint) → inline destructive message.

## Test Plan

| File | it-blocks | Coverage |
|---|---|---|
| `PlatformListPage.test.jsx` | 4 | (a) renders title + count + active platforms; (b) search filters by name; (c) EmptyFilter when search→0; (d) Outlet renders detail child |
| `CreatePlatformSlideOut.test.jsx` | 3 | (a) submit calls REST с правильными полями; (b) submit disabled when name empty; (c) error inline on REST failure |
| `DeletePlatformDialog.test.jsx` | 2 | (a) confirm calls REST; (b) FK error shown inline |
| `PlatformDetailPanel.test.jsx` | 3 | (a) header renders name + contacts subtitle; (b) 2 tabs rendered; (c) Outlet renders child route |
| `PlatformBrandingTab.test.jsx` | 3 | (a) hydrate from outlet context; (b) save disabled когда !dirty; (c) save calls REST с full payload (contacts unchanged) |
| `PlatformContactsTab.test.jsx` | 3 | (a) hydrate; (b) add/remove contact; (c) save filters empty rows + sends full payload (branding unchanged) |

**Mock pattern:**
```js
vi.mock('../../lib/platforms.js', () => ({
  platformApi: vi.fn(),
}))
```

### Manual smoke (preview)

1. `/admin/platforms` — list pane содержит платформы; search фильтрует; EmptyFilter при zero.
2. `+ Новое` → Sheet → name + logo → submit → попадаем на `/admin/platforms/<new>/branding`.
3. Branding tab: загрузить лого, изменить access login, сохранить — persisted.
4. Contacts tab: добавить контакт, заполнить, сохранить — persisted; пустые отфильтрованы.
5. Header «Удалить» → Dialog → confirm → платформа удалена, redirect на `/admin/platforms`.
6. Hard delete защита: создать тестовое агентство привязанное к платформе → попытаться удалить платформу → Dialog показывает FK error inline.
7. Mobile (375px): horizontal tabs «Платформы / Агентства» работают (из 7-shell + 7-agencies); detail full-width.
8. `/admin/agencies` — без регрессов (parallel section).

### Build / lint / test
- `npm run test:run` — те же 19 pre-existing failures + ~17 new platforms passes.
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| REST endpoint `update` requires full payload — race condition между tabs | Acceptable для superadmin-only single-user; не fix'им. Документировано в коде. |
| FK constraint при delete (платформа привязана к агентствам) | RPC error пробрасывается inline в Dialog. User видит и понимает. |
| `<Modal>` из `components/ui` остаётся orphan после удаления PlatformsSection | После Task delete грепнуть `from '../components/ui'` для `Modal`/`InputField`/`TextArea`/`Toast`. Если orphans — отложить cleanup в отдельный mini-subplan (deferred to memory). |
| `usePlatformDetail` не делает свежий fetch (lookup из rows) | Acceptable — после save tabs вызывают `reload` parent'а через outlet context → rows обновляются → lookup возвращает свежий platform. |
| Hard delete без way to undo | Сознательное решение (Q1 в брейнсторме). FK constraint защищает от случайного удаления связной платформы. |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные, не пересекаются.
- [x] Routing diff корректный (verified against current `App.jsx` после 7-shell merge — `<Route path="platforms/*" element={<PlatformsSection />} />` — line 99 of current main).
- [x] REST signatures verified против `api/admin/platforms.js` actions: list/create/update/delete — все используют те же поля что в нашем UI коде.
- [x] Удаляемый legacy file (`PlatformsSection.jsx`) — единственный consumer `<Modal>`/`InputField`/`TextArea`/`Toast` среди /admin (других уже нет — agencies use shadcn после 7-agencies).
- [x] Tests cover REST mocking pattern (platformApi), не visual styling.
- [x] DS toolkit: `<Sheet>`, `<Dialog>`, `<Tabs>`, `<Button>`, `<Skeleton>` — все existing в `src/components/ui/`.
- [x] No new RPC, no new migration — REST существующий.
- [x] Mobile layout уже работает (AdminShell horizontal tabs из 7-shell + 7-agencies).
