import { useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useTeamList } from '../hooks/useTeamList.js'
import { TeamList } from '../components/teams/TeamList.jsx'
import { TeamFilterChips } from '../components/teams/TeamFilterChips.jsx'
import { TeamEmptyZero } from '../components/teams/EmptyZero.jsx'
import { TeamEmptyFilter } from '../components/teams/EmptyFilter.jsx'
import { TeamDetailEmptyHint } from '../components/teams/DetailEmptyHint.jsx'
import { CreateTeamSlideOut } from '../components/teams/CreateTeamSlideOut.jsx'
import { TeamDetailPanel } from '../components/teams/TeamDetailPanel.jsx'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { Button } from '@/components/ui/button'

export function TeamListPage() {
  const { user } = useAuth()
  const { teamId } = useParams()
  const navigate = useNavigate()

  const [active, setActive] = useState('active')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const { rows, loading, error, reload } = useTeamList(user?.id, { active, search })

  const hasSearch = search.trim().length > 0
  const hasActiveFilter = active !== 'active'
  const isEmpty = !loading && !error && rows.length === 0
  const isZeroEmpty = isEmpty && !hasSearch && !hasActiveFilter
  const isFilterEmpty = isEmpty && (hasSearch || hasActiveFilter)

  const selectedId = teamId ? Number(teamId) : null
  const totalForTitle = rows.length

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Команды
      <span className="text-xs font-medium text-[var(--fg4)] tabular">
        {totalForTitle}
      </span>
    </span>
  )

  const createButtonNode = isAdmin ? (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      + Новая
    </Button>
  ) : null

  const searchNode = (
    <SearchInput
      placeholder="Поиск по названию или лиду…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск команд по названию или лиду"
    />
  )

  const filtersNode = !isZeroEmpty ? (
    <TeamFilterChips value={active} onChange={setActive} />
  ) : null

  const listBody = error ? (
    <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
      Ошибка: {error}
    </div>
  ) : loading ? (
    <TeamListSkeleton />
  ) : isZeroEmpty ? (
    <TeamEmptyZero canCreate={isAdmin} onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <TeamEmptyFilter
      hasSearch={hasSearch}
      hasActiveFilter={hasActiveFilter}
      onClearSearch={() => setSearch('')}
      onClearActive={() => setActive('active')}
    />
  ) : (
    <TeamList rows={rows} selectedId={selectedId} user={user} />
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
        listLabel="Список команд"
        detailLabel="Команда"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateTeamSlideOut
          callerId={user?.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`/teams/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — shows the empty hint when no team is selected.
export function TeamDetailEmpty() {
  return <TeamDetailEmptyHint />
}

// Detail child route — pulls teamId from URL and shared data from outlet context.
export function TeamDetailRoute() {
  const { user } = useAuth()
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { rows, reload } = useOutletContext()
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

// ---------------------------------------------------------------------------
// Skeleton + search
// ---------------------------------------------------------------------------

function TeamListSkeleton() {
  // Mirrors TeamListItem structure — round avatar + name + lead + counts.
  const widths = [60, 50, 70, 55, 65, 50]
  return (
    <ul
      className="flex flex-col py-1"
      aria-busy="true"
      aria-label="Загрузка списка команд"
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
            <div
              className="h-2.5 animate-pulse rounded bg-muted/60"
              style={{ width: `${Math.max(20, w - 28)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

