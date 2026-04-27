import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useStaffList } from '../hooks/useStaffList.js'
import { StaffList } from '../components/staff/StaffList.jsx'
import { StaffFilterChips } from '../components/staff/StaffFilterChips.jsx'
import { StaffEmptyZero } from '../components/staff/EmptyZero.jsx'
import { StaffEmptyFilter } from '../components/staff/EmptyFilter.jsx'
import { StaffDetailEmptyHint } from '../components/staff/DetailEmptyHint.jsx'
import { StaffDetailPanel } from '../components/staff/StaffDetailPanel.jsx'
import { CreateStaffSlideOut } from '../components/staff/CreateStaffSlideOut.jsx'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { Button } from '@/components/ui/button'
import { hasPermission } from '../lib/permissions.js'

export function StaffListPage() {
  const { user } = useAuth()
  const { refCode } = useParams()
  const navigate = useNavigate()

  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { rows, counts, loading, error, reload } = useStaffList(user?.id)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (!q) return true
      return (
        (u.first_name ?? '').toLowerCase().includes(q) ||
        (u.last_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.ref_code ?? '').toLowerCase().includes(q) ||
        (u.alias ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, role, search])

  const hasSearch = search.trim().length > 0
  const hasRoleFilter = role !== 'all'
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const canCreate = hasPermission(user, 'create_users')

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Сотрудники
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {filtered.length}
      </span>
    </span>
  )

  const createButtonNode = canCreate ? (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      + Новый
    </Button>
  ) : null

  const searchNode = (
    <SearchInput
      placeholder="Поиск по имени, email, реф-коду…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск сотрудников"
    />
  )

  const filtersNode = !isZeroEmpty ? (
    <StaffFilterChips counts={counts} value={role} onChange={setRole} />
  ) : null

  const listBody = error ? (
    <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
      Ошибка: {error}
    </div>
  ) : loading ? (
    <StaffListSkeleton />
  ) : isZeroEmpty ? (
    <StaffEmptyZero canCreate={canCreate} onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <StaffEmptyFilter
      hasSearch={hasSearch}
      hasRoleFilter={hasRoleFilter}
      onClearSearch={() => setSearch('')}
      onClearRole={() => setRole('all')}
    />
  ) : (
    <StaffList rows={filtered} selectedRefCode={refCode ?? null} />
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
        listLabel="Список сотрудников"
        detailLabel="Сотрудник"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateStaffSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(newRefCode) => {
            setCreateOpen(false)
            reload()
            if (newRefCode) navigate(`/staff/${encodeURIComponent(newRefCode)}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — shows the empty hint when no staff selected.
export function StaffDetailEmpty() {
  return <StaffDetailEmptyHint />
}

// Detail child route — pulls refCode from URL and shared data from outlet context.
export function StaffDetailRoute() {
  const { user } = useAuth()
  const { refCode } = useParams()
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <StaffDetailPanel
      callerId={user?.id}
      user={user}
      refCode={refCode}
      onChanged={reload}
      onBack={() => navigate('/staff')}
    />
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function StaffListSkeleton() {
  const widths = [60, 50, 70, 55, 65, 50]
  return (
    <ul
      className="flex flex-col py-1"
      aria-busy="true"
      aria-label="Загрузка списка сотрудников"
    >
      {widths.map((w, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-l-2 border-l-transparent px-4 py-2.5"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-muted/70"
              style={{ width: `${Math.max(28, w - 18)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
