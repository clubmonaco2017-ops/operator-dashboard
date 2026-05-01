# Admin Section Redesign — Subplan 7-agencies Design

**Date:** 2026-05-01
**Status:** Spec — awaiting user review

## Summary

Часть 2 из 3 в редизайне `/admin`. Этот subplan переводит `/admin/agencies` с table+drawer overlay паттерна на **MasterDetailLayout + URL'ные tabs** — как остальные master/detail страницы сайта (`/clients`, `/teams`, `/staff`). Полная DS-перекраска + миграция всех overlay'ев на shadcn `<Sheet>` / `<Dialog>`. После этого subplan'а единственный legacy кусок в `/admin` — `PlatformsSection` (его покроет 7-platforms).

## Goals

1. `AdminAgenciesPage` → `AgencyListPage` на `MasterDetailLayout` (320px ListPane слева + detail pane справа).
2. `AgencyListItem` (mirror `TeamListItem`): avatar + name + platform subtitle + counters line. Active state через vertical accent bar.
3. ListPane содержит: title с count, search, filter chips (active/архив/все), кнопку «+ Новое».
4. Detail panel: header (name + platform + status badge + меню «⋯» с архивом) + shadcn `<Tabs>` nav (Бренд / Контакты / Админы) + `<Outlet />`.
5. URL-routing: `/admin/agencies/:id/{branding,contacts,admins}` (default → branding).
6. `CreateAgencySlideOut` — shadcn `<Sheet>`, заменяет div-overlay `AgencyCreateModal`. Поля: name + platform + admins (multi-select).
7. `ArchiveAgencyDialog` — shadcn `<Dialog>`, заменяет `window.confirm` + per-row кнопку.
8. Sub-fields (`AgencyBrandingFields`, `AgencyContactsFields`, `AgencyAdminAssignments`) удалены — content инлайн в tab компоненты с full shadcn primitives (`<Input>`, `<Textarea>`, `<Checkbox>`, `<Select>`, `<Label>`, `<Button>`).
9. Padding `p-6` на `<main>` в `AdminShell` удалён — `MasterDetailLayout` сам управляет краями.
10. Никаких новых RPC. Existing: `list_all_agencies`, `get_agency_full`, `create_agency`, `archive_agency`, `update_agency_branding`, `assign_admin_to_agency`, `remove_admin_from_agency`, `list_agency_admins`.

## Non-goals

- Restore (un-archive) функциональность — RPC `restore_agency` не существует. Если потребуется — отдельный мини-subplan (миграция + UI).
- DS-перекраска `PlatformsSection` — это subplan 7-platforms.
- Mobile-specific доработки `AdminShell` — общий mobile responsive отложен (memory `project_mobile_status.md`).
- Изменения в существующих RPC (signature/behaviour остаются прежними).
- Logo upload endpoint (`api/admin/upload-logo`) — без изменений.

## Architecture

### Routing change in `App.jsx`

**Было** (после 7-shell):
```jsx
<Route path="agencies/*" element={<AdminAgenciesPage />} />
```

**Стало:**
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

Default `/admin/agencies/:id` → `branding` tab.

### `AdminShell` правка

Удалить `p-6` с `<main>` (introduced fix from 7-shell). `MasterDetailLayout` рендерит full-bleed list pane + detail pane без внешнего паддинга. (PlatformsSection пока остаётся — он либо получит свой wrap из 7-platforms, либо переживёт без паддинга один день.)

```jsx
// Было:
<main className="overflow-auto p-6"><Outlet /></main>
// Стало:
<main className="overflow-auto"><Outlet /></main>
```

⚠ Side effect: `PlatformsSection` остаётся без обёртки до 7-platforms. Acceptable — обе страницы /admin для superadmin, и mismatch живёт ~24h.

### File Structure

**Created:**
- `src/pages/AgencyListPage.jsx` (~150 LOC) — page-level shell с `MasterDetailLayout`, ListPane, useAgencyList, Sheet state. Exports `AgencyListPage`, `AgencyDetailRoute`, `AgencyDetailEmpty`.
- `src/components/agencies/AgencyList.jsx` (~30 LOC) — `<ul>` рендер `AgencyListItem`.
- `src/components/agencies/AgencyListItem.jsx` (~70 LOC) — single row (avatar, name, platform subtitle, counters, active accent bar).
- `src/components/agencies/AgencyFilterChips.jsx` (~40 LOC) — chip toggle active/архив/все.
- `src/components/agencies/EmptyZero.jsx` (~25 LOC) — нет агентств + CTA.
- `src/components/agencies/EmptyFilter.jsx` (~30 LOC) — фильтр в ноль + clear actions.
- `src/components/agencies/DetailEmptyHint.jsx` (~20 LOC) — правая панель пуста.
- `src/components/agencies/AgencyDetailPanel.jsx` (~150 LOC) — header (name, platform, status badge, dropdown menu) + Tabs nav + Outlet. **Same path as old (180 LOC overlay), but content полностью переписан** — git treats as Modify, not Delete+Create.
- `src/components/agencies/AgencyBrandingTab.jsx` (~180 LOC) — logo upload + access login/password + notes + save. Inlines former AgencyBrandingFields content with shadcn `<Input>`/`<Textarea>`/`<Button>`.
- `src/components/agencies/AgencyContactsTab.jsx` (~150 LOC) — multi-contact editor (add/remove cards, name/role/phone/email/telegram fields, save). Inlines former AgencyContactsFields.
- `src/components/agencies/AgencyAdminsTab.jsx` (~110 LOC) — checkbox list of all active admins, auto-save per toggle. Inlines former AgencyAdminAssignments.
- `src/components/agencies/CreateAgencySlideOut.jsx` (~180 LOC) — shadcn `<Sheet>` с form (name + platform Select + admins multi-select Combobox).
- `src/components/agencies/ArchiveAgencyDialog.jsx` (~80 LOC) — shadcn `<Dialog>` confirmation.
- `src/hooks/useAgencyList.js` (~50 LOC) — wraps `supabase.rpc('list_all_agencies')`, returns `{ rows, loading, error, reload }`.
- `src/hooks/useAgencyDetail.js` (~40 LOC) — wraps `supabase.rpc('get_agency_full', { p_id })`, returns `{ agency, loading, error, reload }`. Used by `AgencyDetailPanel`.

**Tests (created):**
- `src/pages/AgencyListPage.test.jsx` (~120 LOC, 5-6 it-blocks)
- `src/components/agencies/CreateAgencySlideOut.test.jsx` (~100 LOC, 3-4 it-blocks)
- `src/components/agencies/ArchiveAgencyDialog.test.jsx` (~70 LOC, 2-3 it-blocks)
- `src/components/agencies/AgencyAdminsTab.test.jsx` (~90 LOC, 2-3 it-blocks)
- `src/components/agencies/AgencyDetailPanel.test.jsx` (~80 LOC, 2-3 it-blocks)
- `src/components/agencies/AgencyBrandingTab.test.jsx` (~100 LOC, 2-3 it-blocks)
- `src/components/agencies/AgencyContactsTab.test.jsx` (~100 LOC, 2-3 it-blocks)

**Modified:**
- `src/App.jsx` — заменить `<Route path="agencies/*" ...>` на nested route block; добавить импорты новых компонентов.
- `src/components/admin-shell/AdminShell.jsx` — убрать `p-6` с `<main>`.

**Deleted:**
- `src/pages/AdminAgenciesPage.jsx` (92 LOC) — заменён `AgencyListPage`.
- `src/components/agencies/AgencyTable.jsx` (74 LOC) — заменён `AgencyList` + `AgencyListItem`.
- `src/components/agencies/AgencyCreateModal.jsx` (145 LOC) — заменён `CreateAgencySlideOut`.
- `src/components/agencies/AgencyBrandingFields.jsx` (114 LOC) — content в `AgencyBrandingTab`.
- `src/components/agencies/AgencyContactsFields.jsx` (60 LOC) — content в `AgencyContactsTab`.
- `src/components/agencies/AgencyAdminAssignments.jsx` (106 LOC) — content в `AgencyAdminsTab`.

(**Note:** старый `AgencyDetailPanel.jsx` 180 LOC переписан в-place с тем же именем — это перечислено в Created list как Modify, не отдельный delete.)

**Net diff:** +~1320 LOC новых компонентов (incl. useAgencyDetail) / +~660 LOC тестов / −591 LOC legacy (6 удалённых файлов; AgencyDetailPanel переписан in-place с -180+150 = -30 net) = чистый прирост ~1390 LOC, но с полным DS/shadcn покрытием и unified pattern.

## Component Details

### `AgencyListItem` visual

3-line row (~64px height), mirror `TeamListItem`:

```
▌ ⓐ  Agency Name
     DREAM SINGLES
     3 сотр. · 5 клиентов · 2 команды
```

- Round avatar 36px — буква имени (стиль `TeamListItem`'s `<Avatar id name />`).
- Active state: `border-l-2 border-l-primary bg-muted` (как `TeamListItem`).
- Archived: avatar `opacity-60`, text `text-muted-foreground/60`.
- Click: `<Link to={\`/admin/agencies/${a.id}\`}>` — открывает default tab «branding».
- Counters string: `«N сотр. · M клиентов · K команд»` через простую concat (helper не требуется).

### `AgencyListPage` layout

```jsx
<MasterDetailLayout
  listPane={
    <ListPane
      title={<span>Агентства <span className="text-xs text-muted-foreground">{rows.length}</span></span>}
      search={<SearchInput value={search} onChange={setSearch} placeholder="Поиск по названию…" />}
      filters={<AgencyFilterChips value={status} onChange={setStatus} />}
      createButton={<Button size="sm" onClick={() => setCreateOpen(true)}>+ Новое</Button>}
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

{createOpen && <CreateAgencySlideOut onClose={() => setCreateOpen(false)} onCreated={(id) => { reload(); navigate(\`/admin/agencies/${id}\`) }} />}
```

`listBody` рендерит skeleton / EmptyZero / EmptyFilter / `<AgencyList rows={filtered} selectedId={agencyId} />` — через те же ветвления, что `TeamListPage`.

Filter+search вычисляется client-side:
```jsx
const filtered = rows.filter(a => {
  if (status === 'active' && !a.is_active) return false
  if (status === 'archive' && a.is_active) return false
  if (search.trim() && !a.name.toLowerCase().includes(search.trim().toLowerCase())) return false
  return true
})
```

### `AgencyDetailPanel` (новый)

```jsx
export function AgencyDetailPanel({ agencyId, siblings, onChanged, onBack }) {
  const { data: agency, loading, error } = useAgencyDetail(agencyId)  // wraps get_agency_full
  const isMobile = useIsMobile()
  const [archiveOpen, setArchiveOpen] = useState(false)

  if (loading) return <SkeletonHeader />
  if (error || !agency) return <DetailEmptyHint error={error} />

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">{agency.name}</h1>
              <p className="text-sm text-muted-foreground truncate">
                {agency.platform_name}
                {' · '}
                <Badge variant={agency.is_active ? 'outline' : 'secondary'}>
                  {agency.is_active ? 'Активно' : 'Архив'}
                </Badge>
              </p>
            </div>
          </div>
          {agency.is_active && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><MoreVertical /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setArchiveOpen(true)} className="text-destructive">
                  Архивировать
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Tabs value={currentTab} onValueChange={(v) => navigate(\`/admin/agencies/${agencyId}/${v}\`)}>
          <TabsList>
            <TabsTrigger value="branding">Бренд</TabsTrigger>
            <TabsTrigger value="contacts">Контакты</TabsTrigger>
            <TabsTrigger value="admins">Админы</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      <main className="flex-1 overflow-auto p-6">
        <Outlet context={{ agency, reload: onChanged }} />
      </main>

      {archiveOpen && (
        <ArchiveAgencyDialog
          agency={agency}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => { onChanged(); navigate('/admin/agencies') }}
        />
      )}
    </div>
  )
}
```

`currentTab` — через `useLocation()` парсит последний сегмент URL.

### `AgencyBrandingTab` save flow

```jsx
export function AgencyBrandingTab() {
  const { agency, reload } = useOutletContext()
  const [form, setForm] = useState({ logo_url: '', access_login: '', access_password: '', notes: '' })
  const [dirty, setDirty] = useState(false)
  // hydrate from agency on mount/change
  useEffect(() => {
    setForm({ logo_url: agency.logo_url ?? '', access_login: agency.access_login ?? '', ... })
    setDirty(false)
  }, [agency.id])

  const save = async () => {
    const { error } = await supabase.rpc('update_agency_branding', {
      p_id: agency.id,
      p_logo_url: form.logo_url || null,
      p_contacts: null,                          // не трогаем контакты
      p_access_login: form.access_login || null,
      p_access_password: form.access_password || null,
      p_notes: form.notes || null,
    })
    if (error) { setError(error.message); return }
    setDirty(false)
    reload()
  }

  // ...UI: <Label>+<Input>, logo upload, password show/hide, notes textarea
  // Cmd/Ctrl+Enter handler → save
  // Footer: <Button onClick={cancel}>Отменить</Button> <Button disabled={!dirty} onClick={save}>Сохранить</Button>
}
```

`AgencyContactsTab` — аналогично, но с `p_contacts: cleaned` и nulls для остальных. Cleaned = `contacts.filter(c => c.name || c.phone || c.email || c.telegram || c.role)`.

`AgencyAdminsTab` — auto-save per toggle, без save button. Optimistic UI (set state, на ошибке RPC — rollback + error inline).

### `CreateAgencySlideOut`

shadcn `<Sheet side="right">` с width `sm:max-w-md`. Form:
- `<Label>Название</Label><Input value={name} required />`
- `<Label>Платформа</Label><Select value={platformId}>...</Select>` (через shadcn Select — load platforms через `supabase.from('platforms').select('id, name')`).
- `<Label>Админы (опционально)</Label>` — multi-select. Реализация: `<Popover>` + `<Command>` + `<CommandInput>` + `<CommandItem>`. Selected админы — chips с кнопкой ×. Reference: similar pattern существует в `CreateStaffSlideOut.jsx` (`MultiAgencyChips`).
- Footer: `<Button variant="outline">Отменить</Button> <Button type="submit">Создать</Button>`.
- Cmd/Ctrl+Enter → submit.
- Submit: `supabase.rpc('create_agency', { p_name, p_platform_id, p_admin_ids })`. На успех: close + onCreated(new_id) → page navigates.

### `ArchiveAgencyDialog`

shadcn `<Dialog>`:
- Title: «Архивировать агентство?»
- Description: «{agency.name} будет скрыто из активного списка. У агентства не должно быть активных пользователей, клиентов или команд.»
- Footer: `<Button variant="outline">Отменить</Button> <Button variant="destructive">Архивировать</Button>`.
- Confirm: `supabase.rpc('archive_agency', { p_agency_id })`. На успех: close + onArchived() → page navigates на /admin/agencies. На error (например, агентство не пустое): error inline, кнопка остаётся доступной для retry.

### `useAgencyList` hook

```js
export function useAgencyList() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('list_all_agencies')
    if (error) { setError(error.message); setRows([]) }
    else setRows((data ?? []).map(r => ({
      id: r.out_id, name: r.out_name, platform_id: r.out_platform_id, platform_name: r.out_platform_name,
      is_active: r.out_is_active, admin_count: r.out_admin_count, user_count: r.out_user_count,
      client_count: r.out_client_count, team_count: r.out_team_count, created_at: r.out_created_at,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
  return { rows, loading, error, reload }
}
```

`useAgencyDetail(id)` — wrapper над `get_agency_full(p_id: id)`, аналогично pattern.

## Test Plan

### Unit (`vitest` + `@testing-library/react` + `MemoryRouter`)

| File | it-blocks |
|---|---|
| `AgencyListPage.test.jsx` | (a) renders title with count; (b) filter chip switches list; (c) search filters by name; (d) EmptyFilter when search→0; (e) Outlet renders detail child route |
| `CreateAgencySlideOut.test.jsx` | (a) submit calls `create_agency` with correct args; (b) submit disabled when name/platform empty; (c) closes Sheet + navigates на новое агентство при success |
| `ArchiveAgencyDialog.test.jsx` | (a) confirm calls `archive_agency`; (b) error shown inline on RPC error; (c) navigates на /admin/agencies при success |
| `AgencyAdminsTab.test.jsx` | (a) checkbox toggle calls `assign_admin_to_agency` for unchecked→checked; (b) calls `remove_admin_from_agency` for checked→unchecked; (c) optimistic update visible immediately |
| `AgencyDetailPanel.test.jsx` | (a) header renders name + platform + status badge; (b) Tabs trigger navigates; (c) menu «Архивировать» открывает Dialog |
| `AgencyBrandingTab.test.jsx` | (a) save disabled когда !dirty; (b) save calls `update_agency_branding` с branding-only slice (другие params NULL); (c) form hydrates from outlet context |
| `AgencyContactsTab.test.jsx` | (a) add contact + remove contact работают; (b) save отправляет `p_contacts` с фильтрованными пустыми; (c) save calls `update_agency_branding` с contacts-only slice |

**Mock pattern** (per existing tests):
```js
vi.mock('../../supabaseClient.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn() })) })) }
}))
```

### Integration smoke (manual в preview)

1. `/admin/agencies` — list pane содержит активные; chip переключает на архив/все; search фильтрует.
2. `+ Новое` → Sheet → создать → попадаем на `/admin/agencies/<new>/branding`.
3. Branding: загрузить лого, сохранить, перезагрузить — лого persisted.
4. Contacts: добавить контакт, заполнить, сохранить, перезагрузить — сохранилось.
5. Admins: toggle чекбокс → перезагрузить — persisted.
6. Dropdown «⋯» → «Архивировать» → Dialog → confirm → агентство в архиве, redirected на /admin/agencies.
7. Mobile (DevTools 375px): list pane полная ширина; клик по агентству → detail full-screen; back button возвращает.
8. Baseline: остальные секции (`/staff`, `/clients`, `/teams`, `/admin/platforms`) — без регрессов.

### Build / lint / test
- `npm run test:run` — те же 19 pre-existing failures + ~25 new agencies tests passing.
- `npm run build` — clean.
- `npm run lint` — без новых ошибок.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Mismatch UI: `/admin/agencies` модернизировано, `/admin/platforms` всё ещё legacy slate/indigo (~24h до 7-platforms) | /admin доступен только superadmin'у. Acceptable. |
| `p-6` removal в AdminShell ломает PlatformsSection visual edges | PlatformsSection остаётся legacy ~24h. Когда 7-platforms придёт — она получит свой layout без зависимости от родительского padding. |
| Restore (un-archive) flow не реализован | Out of scope (нет RPC). Архивация — terminal-state в этом subplan'е. Если потребуется — separate mini-subplan. |
| Multi-select Combobox для admins может не существовать как готовый component | Если нет — реализовать inline на shadcn `<Popover>` + `<Command>` (паттерн уже знаком из `CreateStaffSlideOut`). |
| 25+ новых тестов может занять много diff'а | Acceptable; тесты — value, не cost. Каждый тест проверяет разное behaviour. |
| Mobile UX (220px sub-sidebar + 320px list pane на 375px iPhone'е) | Уже зафиксировано в memory как known limitation. /admin для desktop-only superadmin use. Не блокер. |
| `useAgencyList` дубль логики из `AdminAgenciesPage` (которая удаляется) | Sequential refactor — старая страница удалена в одной задаче с заменой. Hook reusable for future (e.g., в `CreateAgencySlideOut` если нужен список платформ из RPC). |

## Verification checklist (per spec self-review)

- [x] Goals и non-goals явные, не пересекаются.
- [x] Routing diff корректный (proverено against current `App.jsx` после 7-shell merge).
- [x] Все existing RPC проверены против `db/migrations/20260429_59_rpc_agencies_crud.sql` и `20260501_80_rpc_agency_branding.sql` — signatures совпадают.
- [x] Удаляемые legacy файлы (7 файлов, 771 LOC) — все ссылки идут только из `AdminAgenciesPage.jsx`, который тоже удаляется.
- [x] Ни одна задача не трогает `PlatformsSection` (это 7-platforms scope).
- [x] Tests cover RPC mocking pattern, не visual styling.
- [x] Sub-fields fully inlined (нет orphan'ов после удаления).
- [x] DS toolkit использован: `<Sheet>`, `<Dialog>`, `<Tabs>`, `<DropdownMenu>`, `<Badge>`, `<Input>`, `<Textarea>`, `<Checkbox>`, `<Select>`, `<Label>`, `<Button>`, `<Popover>`, `<Command>` — все existing в `src/components/ui/`.
