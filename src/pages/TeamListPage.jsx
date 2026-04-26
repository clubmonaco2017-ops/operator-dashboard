import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useAuth } from '../useAuth.jsx'
import { Sidebar } from '../components/Sidebar.jsx'
import { useTeamList } from '../hooks/useTeamList.js'
import { TeamList } from '../components/teams/TeamList.jsx'
import { TeamFilterChips } from '../components/teams/TeamFilterChips.jsx'
import { TeamEmptyZero } from '../components/teams/EmptyZero.jsx'
import { TeamEmptyFilter } from '../components/teams/EmptyFilter.jsx'
import { TeamDetailEmptyHint } from '../components/teams/DetailEmptyHint.jsx'
import { CreateTeamSlideOut } from '../components/teams/CreateTeamSlideOut.jsx'
import { TeamDetailPanel } from '../components/teams/TeamDetailPanel.jsx'
import { pluralizeTeams } from '../lib/teams.js'

export function TeamListPage() {
  const { user, logout } = useAuth()
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

  const detailIsOpen = !!teamId
  const totalForTitle = rows.length

  // 1024-px breakpoint: master-detail collapses to single panel.
  // When teamId set on narrow → show detail; иначе — master.
  const showMasterOnNarrow = !detailIsOpen
  const showDetailOnNarrow = detailIsOpen

  const selectedId = useMemo(() => (teamId ? Number(teamId) : null), [teamId])

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex flex-1">
        {/* Master panel */}
        <section
          className={[
            'flex flex-col border-r border-border bg-card',
            isZeroEmpty || isFilterEmpty ? 'flex-1' : 'lg:w-[440px] lg:shrink-0',
            !isZeroEmpty && !isFilterEmpty && (showMasterOnNarrow ? 'flex-1 lg:flex-initial' : 'hidden lg:flex'),
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Список команд"
        >
          <header className="flex items-center gap-3 px-5 pt-5 pb-3">
            <h1 className="flex items-baseline gap-2 text-xl font-bold text-foreground">
              Команды
              <span className="text-sm font-medium text-[var(--fg4)] tabular">
                {totalForTitle}
              </span>
            </h1>
            <div className="flex-1" />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="btn-primary"
              >
                + Создать команду
              </button>
            )}
          </header>

          {/* Search */}
          <div className="px-5 pb-3">
            <SearchInput value={search} onChange={setSearch} />
          </div>

          {/* Filter chips */}
          {!isZeroEmpty && (
            <div className="px-5 pb-3">
              <TeamFilterChips value={active} onChange={setActive} />
            </div>
          )}

          {/* Body: list / empty / loading / error */}
          <div className="flex-1 overflow-auto">
            {error ? (
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
            )}
          </div>

          {/* Footer counter */}
          {!loading && !error && rows.length > 0 && (
            <footer className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              <span className="tabular">{pluralizeTeams(rows.length)}</span>
            </footer>
          )}
        </section>

        {/* Detail panel */}
        {!(isZeroEmpty || isFilterEmpty) && (
          <section
            className={[
              'flex-1 overflow-hidden bg-card',
              showDetailOnNarrow ? 'flex' : 'hidden lg:flex',
            ].join(' ')}
            aria-label="Профиль команды"
          >
            {detailIsOpen ? (
              <TeamDetailPanel
                callerId={user?.id}
                user={user}
                teamId={Number(teamId)}
                siblings={rows}
                onChanged={reload}
                onBack={() => navigate('/teams')}
              />
            ) : (
              <TeamDetailEmptyHint />
            )}
          </section>
        )}
      </main>

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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton + placeholder + search
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

function SearchInput({ value, onChange }) {
  return (
    <label className="relative flex items-center">
      <Search aria-hidden className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--fg4)]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по названию или лиду…"
        aria-label="Поиск команд по названию или лиду"
        className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus:border-primary focus-ds"
      />
    </label>
  )
}
