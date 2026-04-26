import { Link } from 'react-router-dom'
import { canEditTeam, formatLeadRole, pluralizeOperators } from '../../lib/teams.js'
import { pluralizeClients } from '../../lib/clients.js'

/**
 * Один элемент master-списка команд. Активный = vertical accent bar слева + bold name.
 * Если канер не может редактировать команду — справа бейдж «Только просмотр».
 *
 * @param {object} props
 * @param {object} props.team — row из list_teams
 * @param {boolean} props.isActive — этот item открыт в detail
 * @param {object|null} props.user — текущий user
 */
export function TeamListItem({ team, isActive, user }) {
  const archived = !team.is_active
  const canEdit = canEditTeam(user, team)
  const leadLine = team.lead_user_id
    ? `${formatLeadRole(team.lead_role)} ${team.lead_name ?? ''}`.trim()
    : 'Без лида'
  const countsLine = `${pluralizeOperators(team.members_count ?? 0)} · ${pluralizeClients(
    team.clients_count ?? 0,
  )}`

  return (
    <Link
      to={`/teams/${team.id}`}
      className={[
        'group relative flex items-center gap-3 px-4 py-2.5 outline-none transition-colors',
        'border-l-2',
        isActive
          ? 'border-l-primary bg-muted'
          : 'border-l-transparent hover:bg-muted/60',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
    >
      <Avatar id={team.id} name={team.name} muted={archived} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            title={team.name}
            className={[
              'truncate text-sm',
              isActive
                ? 'font-semibold text-foreground'
                : 'font-medium text-[var(--fg2)]',
              archived && 'opacity-60',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {team.name}
          </span>
          {archived && (
            <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Архив
            </span>
          )}
          {!canEdit && !archived && (
            <span className="ml-auto rounded bg-muted px-1.5 py-px text-[10px] font-medium text-[var(--fg4)]">
              Только просмотр
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground" title={leadLine}>
          {leadLine}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--fg4)] tabular">
          {countsLine}
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Avatar with deterministic categorical color (id mod 6)
// ---------------------------------------------------------------------------

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

// Категориальные тона. DS пока не покрывает «6 нейтрально-тёплых аватарных тонов»,
// поэтому здесь намеренно используем Tailwind palette напрямую — точечное
// исключение из правила «только DS-токены» (см. план Subplan 4 Stage 6).
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

function Avatar({ id, name, muted }) {
  return (
    <div
      className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
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
