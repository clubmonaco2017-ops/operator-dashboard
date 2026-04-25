/**
 * Filter chips для master-списка.
 *
 * Три состояния chip'а (см. _decisions.md R2.0a.4):
 *   - default            — серый бордер, серый текст (значение не задано)
 *   - value-set          — серый бордер, обычный текст (значение есть, но дефолтное)
 *   - changed-by-user    — синий бордер/фон, синий текст, ✕ для снятия
 *
 * @param {object} props
 * @param {object} props.value — { active: 'active'|'archived'|'all', platformId: uuid|null, agencyId: uuid|null }
 * @param {function} props.onChange — (next) => void; merged into value
 * @param {Array} props.platforms — [{ id, name }]
 * @param {Array} props.agencies — [{ id, name, platform_id }]
 * @param {object} props.counts — { all, active, archived }
 */
export function ClientFilterChips({ value, onChange, platforms, agencies, counts }) {
  const set = (patch) => onChange({ ...value, ...patch })

  const activeChanged = value.active !== 'active'
  const platformChanged = value.platformId !== null
  const agencyChanged = value.agencyId !== null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Active / Archived */}
      <Chip
        active={activeChanged}
        onClear={activeChanged ? () => set({ active: 'active' }) : null}
      >
        <span
          className={[
            'inline-block h-1.5 w-1.5 rounded-full',
            value.active === 'archived'
              ? 'bg-slate-400'
              : value.active === 'all'
                ? 'bg-slate-300'
                : 'bg-emerald-500',
          ].join(' ')}
        />
        <select
          value={value.active}
          onChange={(e) => set({ active: e.target.value })}
          className="cursor-pointer bg-transparent text-sm outline-none"
        >
          <option value="active">Активные {counts ? counts.active : ''}</option>
          <option value="archived">Архив {counts ? counts.archived : ''}</option>
          <option value="all">Все {counts ? counts.all : ''}</option>
        </select>
      </Chip>

      {/* Platform */}
      <Chip
        active={platformChanged}
        onClear={platformChanged ? () => set({ platformId: null }) : null}
      >
        <PlatformIcon />
        <select
          value={value.platformId ?? ''}
          onChange={(e) => set({ platformId: e.target.value || null })}
          className="cursor-pointer bg-transparent text-sm outline-none"
        >
          <option value="">Платформа все</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Chip>

      {/* Agency */}
      <Chip
        active={agencyChanged}
        onClear={agencyChanged ? () => set({ agencyId: null }) : null}
      >
        <AgencyIcon />
        <select
          value={value.agencyId ?? ''}
          onChange={(e) => set({ agencyId: e.target.value || null })}
          className="cursor-pointer bg-transparent text-sm outline-none"
        >
          <option value="">Агентство все</option>
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Chip>
    </div>
  )
}

function Chip({ children, active, onClear }) {
  return (
    <div
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors',
        active
          ? 'border-primary bg-[var(--primary-soft)] text-[var(--primary-ink)]'
          : 'border-border text-[var(--fg2)] hover:border-border-strong',
      ].join(' ')}
    >
      {children}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-0.5 rounded-full p-0.5 text-[var(--primary-ink)]/70 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-ink)] focus-ds"
          aria-label="Снять фильтр"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M2.5 2.5l7 7m0-7l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

function PlatformIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 7h11M7 1.5c1.8 1.8 1.8 9.2 0 11M7 1.5c-1.8 1.8-1.8 9.2 0 11" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function AgencyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <rect x="1.5" y="3.5" width="11" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 3.5v-1.5a1 1 0 011-1h2a1 1 0 011 1v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
