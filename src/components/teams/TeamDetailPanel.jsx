import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeam } from '../../hooks/useTeam.js'
import { useTeamActions } from '../../hooks/useTeamActions.js'
import { canEditTeam, formatLeadRole } from '../../lib/teams.js'
import { TeamMembersTab } from './TeamMembersTab.jsx'
import { TeamClientsTab } from './TeamClientsTab.jsx'
import { TeamActivityTab } from './TeamActivityTab.jsx'
import { ArchiveTeamConfirmDialog } from './ArchiveTeamConfirmDialog.jsx'
import { ReadOnlyBadge } from './ReadOnlyBadge.jsx'

const TAB_LABELS = {
  members: 'Состав',
  clients: 'Клиенты',
  activity: 'Активность',
}

/**
 * Detail-панель открытой команды (Subplan 4 Stage 7).
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {object} props.user
 * @param {number} props.teamId
 * @param {Array}  props.siblings — массив команд из master (для pagination ‹ ›)
 * @param {function} props.onChanged — callback после изменений (reload master)
 * @param {function} props.onBack — back to list (mobile)
 */
export function TeamDetailPanel({ callerId, user, teamId, siblings = [], onChanged, onBack }) {
  const navigate = useNavigate()
  const { row, loading, error, reload } = useTeam(callerId, teamId)
  const { archiveTeam, restoreTeam } = useTeamActions(callerId)

  const [tab, setTab] = useState('members')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  const { prev, next, position } = useMemo(() => {
    if (!siblings.length || !teamId) return { prev: null, next: null, position: 0 }
    const id = Number(teamId)
    const idx = siblings.findIndex((t) => t.id === id)
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
      position: idx + 1,
    }
  }, [siblings, teamId])

  function bothChanged() {
    reload()
    onChanged?.()
  }

  async function toggleStatus() {
    if (statusBusy || !row) return
    if (row.is_active) {
      setArchiveOpen(true)
      return
    }
    setStatusBusy(true)
    try {
      await restoreTeam(row.id)
      bothChanged()
    } catch (e) {
      alert(`Не удалось восстановить: ${e.message}`)
    } finally {
      setStatusBusy(false)
    }
  }

  async function confirmArchive() {
    if (!row) return
    setStatusBusy(true)
    try {
      await archiveTeam(row.id)
      setArchiveOpen(false)
      bothChanged()
    } catch (e) {
      alert(`Не удалось архивировать: ${e.message}`)
    } finally {
      setStatusBusy(false)
    }
  }

  if (loading && !row) return <DetailSkeleton />
  if (error) {
    return (
      <div className="px-6 py-10" role="alert">
        <p className="text-sm text-[var(--danger-ink)]">Ошибка: {error}</p>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate('/teams'))}
          className="mt-3 text-sm text-primary hover:underline focus-ds rounded"
        >
          ← К списку
        </button>
      </div>
    )
  }
  if (!row) return null

  const editable = canEditTeam(user, row)
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const counts = {
    members: row.members_count ?? (row.members?.length ?? 0),
    clients: row.clients_count ?? (row.clients?.length ?? 0),
    activity: null,
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar: breadcrumb + status toggle + pagination */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <nav
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          aria-label="Хлебные крошки"
        >
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate('/teams'))}
            className="rounded hover:text-foreground focus-ds"
            aria-label="Вернуться к списку команд"
          >
            <span className="lg:hidden">← Список</span>
            <span className="hidden lg:inline">Команды</span>
          </button>
          <span className="hidden lg:inline" aria-hidden>›</span>
          <span
            className="hidden truncate font-medium text-foreground lg:inline"
            title={row.name}
          >
            {row.name}
          </span>
        </nav>

        <div className="flex items-center gap-3">
          <StatusToggle
            active={row.is_active}
            busy={statusBusy}
            canToggle={isAdmin}
            onToggle={toggleStatus}
          />
          {siblings.length > 0 && (
            <Pagination
              position={position}
              total={siblings.length}
              prev={prev}
              next={next}
              onGo={(t) => navigate(`/teams/${t.id}`)}
            />
          )}
        </div>
      </div>

      {/* Header */}
      <header className="flex items-start gap-4 px-6 pt-5 pb-4">
        <Avatar id={row.id} name={row.name} muted={!row.is_active} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-xl font-bold text-foreground" title={row.name}>
              {row.name}
            </h1>
            {!editable && <ReadOnlyBadge />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {row.lead_user_id ? (
              <span className="inline-flex items-center gap-1.5">
                <RoleBadge role={row.lead_role} />
                <span className="font-medium text-foreground">{row.lead_name ?? '—'}</span>
              </span>
            ) : (
              <span className="italic text-[var(--fg4)]">Без лида</span>
            )}
          </div>
          <div className="mt-1 text-xs text-[var(--fg4)]">
            Создана {formatRuDate(row.created_at)}
            {row.created_by_name && ` · @ ${row.created_by_name}`}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <nav
          className="-mb-px flex gap-6 overflow-x-auto"
          aria-label="Разделы команды"
          role="tablist"
        >
          {Object.entries(TAB_LABELS).map(([key, label]) => {
            const isActive = key === tab
            const count = counts[key]
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setTab(key)}
                className={[
                  'flex shrink-0 items-center gap-2 border-b-2 py-3 text-sm transition-colors focus-ds rounded-t',
                  isActive
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
                {count != null && (
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[11px] font-medium tabular',
                      isActive
                        ? 'bg-[var(--primary-soft)] text-[var(--primary-ink)]'
                        : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto bg-background px-4 py-5 sm:px-6">
        {tab === 'members' && (
          <TeamMembersTab callerId={callerId} user={user} row={row} reload={bothChanged} />
        )}
        {tab === 'clients' && (
          <TeamClientsTab callerId={callerId} user={user} row={row} reload={bothChanged} />
        )}
        {tab === 'activity' && (
          <TeamActivityTab callerId={callerId} teamId={row.id} />
        )}
      </div>

      {archiveOpen && (
        <ArchiveTeamConfirmDialog
          teamName={row.name}
          members={counts.members}
          clients={counts.clients}
          busy={statusBusy}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={confirmArchive}
        />
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusToggle({ active, busy, canToggle, onToggle }) {
  const base =
    'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-ds'
  const styled = active
    ? 'border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success-ink)]'
    : 'border-border bg-muted text-muted-foreground'

  if (!canToggle) {
    return (
      <span className={[base, styled].join(' ')} role="status" aria-label={active ? 'Активна' : 'Архив'}>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[var(--success)]' : 'bg-[var(--fg4)]'}`} aria-hidden />
        {active ? 'Активна' : 'Архив'}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={[
        base,
        styled,
        active ? 'hover:opacity-80' : 'hover:bg-[var(--surface-3)]',
        'disabled:opacity-50',
      ].join(' ')}
      title={active ? 'Кликнуть, чтобы архивировать' : 'Кликнуть, чтобы восстановить'}
      aria-label={active ? 'Архивировать команду' : 'Восстановить команду'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[var(--success)]' : 'bg-[var(--fg4)]'}`} aria-hidden />
      {active ? 'Активна' : 'Архив'}
    </button>
  )
}

function Pagination({ position, total, prev, next, onGo }) {
  return (
    <div
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      role="group"
      aria-label="Навигация по командам"
    >
      <button
        type="button"
        onClick={() => prev && onGo(prev)}
        disabled={!prev}
        title={prev ? prev.name : 'Это первая команда'}
        aria-label={prev ? `Предыдущая: ${prev.name}` : 'Предыдущая — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40 focus-ds"
      >
        ‹
      </button>
      <span className="px-1 font-mono tabular" aria-label={`Позиция ${position} из ${total}`}>
        {position}/{total}
      </span>
      <button
        type="button"
        onClick={() => next && onGo(next)}
        disabled={!next}
        title={next ? next.name : 'Это последняя команда'}
        aria-label={next ? `Следующая: ${next.name}` : 'Следующая — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40 focus-ds"
      >
        ›
      </button>
    </div>
  )
}

function RoleBadge({ role }) {
  if (!role) return null
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {formatLeadRole(role) || role}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Avatar (deterministic categorical color, mirrors TeamListItem)
// ---------------------------------------------------------------------------

const AVATAR_TONES = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
]

function teamAvatarColor(id) {
  const n = Math.abs(Number(id) || 0)
  return AVATAR_TONES[n % AVATAR_TONES.length]
}

function teamInitials(name) {
  const s = String(name ?? '').trim()
  if (!s) return '?'
  const parts = s.split(/\s+/).filter(Boolean)
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  )
}

function Avatar({ id, name, muted }) {
  return (
    <div
      className={[
        'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold',
        teamAvatarColor(id),
        muted && 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {teamInitials(name)}
    </div>
  )
}

function DetailSkeleton() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 2000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="flex h-full w-full flex-col" aria-busy="true" aria-label="Загрузка профиля команды">
      {slow && (
        <p
          className="border-b border-border bg-muted/40 px-6 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Загружается…
        </p>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Header */}
      <header className="flex items-start gap-4 px-6 pt-5 pb-4">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
          <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/60" />
        </div>
      </header>

      {/* Tab row */}
      <div className="border-b border-border px-6">
        <nav className="mt-2 flex gap-6 pb-3">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-background px-6 py-5">
        <div className="surface-card h-48 animate-pulse" />
      </div>
    </div>
  )
}

function formatRuDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

