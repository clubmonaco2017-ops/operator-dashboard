import { useEffect, useMemo, useRef, useState } from 'react'
import { useAssignableUsers } from '../../hooks/useAssignableUsers.js'

const ELIGIBILITY_LABEL = {
  admin_full_access: 'Полный доступ',
  cross_staff: 'Лид/модератор',
  own_team_operator: 'Ваш оператор',
  curated_operator: 'Курируемый оператор',
}

const ROLE_LABEL = {
  admin: 'Админ',
  superadmin: 'Суперадмин',
  teamlead: 'Тимлид',
  moderator: 'Модератор',
  operator: 'Оператор',
}

function userInitials(name) {
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

/**
 * Селектор исполнителя задачи. Поиск + список кандидатов через RPC
 * list_assignable_users. Каждая опция показывает имя, role-badge,
 * eligibility tooltip.
 *
 * @param {object} props
 * @param {number|null} props.callerId
 * @param {number|null} props.value — id выбранного user
 * @param {(id:number|null) => void} props.onChange
 * @param {string} [props.error]
 * @param {boolean} [props.disabled]
 */
export function AssigneeSelector({ callerId, value, onChange, error, disabled }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(true)
  const { rows, loading } = useAssignableUsers(callerId, search)
  const searchRef = useRef(null)

  // Хранит снимок выбранного объекта — нужен для отображения после фильтрации
  const [selectedSnapshot, setSelectedSnapshot] = useState(null)

  useEffect(() => {
    if (value == null) {
      setSelectedSnapshot(null)
      return
    }
    const found = rows.find((r) => r.id === value)
    if (found) setSelectedSnapshot(found)
  }, [value, rows])

  const selected = useMemo(() => {
    if (value == null) return null
    return rows.find((r) => r.id === value) ?? selectedSnapshot
  }, [value, rows, selectedSnapshot])

  function handleSelect(option) {
    onChange(option.id)
    setOpen(false)
  }

  function handleChange() {
    setOpen(true)
    setTimeout(() => searchRef.current?.focus(), 0)
  }

  // Если уже что-то выбрано и dropdown закрыт — показываем сводку с change-link
  if (selected && !open) {
    return (
      <div
        className={[
          'flex items-center gap-3 rounded-lg border bg-card px-3 py-2',
          error ? 'border-[var(--danger)]' : 'border-border',
        ].join(' ')}
      >
        <Avatar name={selected.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {selected.name}
            </span>
            <RoleBadge role={selected.role} />
          </div>
          {selected.ref_code && (
            <div className="mt-0.5 truncate font-mono text-xs text-[var(--fg4)]">
              {selected.ref_code}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleChange}
          disabled={disabled}
          className="text-xs font-medium text-[var(--primary-ink)] hover:underline disabled:opacity-50 focus-ds rounded outline-none"
        >
          Изменить
        </button>
      </div>
    )
  }

  return (
    <div
      className={[
        'rounded-lg border bg-card',
        error ? 'border-[var(--danger)]' : 'border-border',
      ].join(' ')}
    >
      <div className="border-b border-border p-2">
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
          placeholder="Поиск по имени или коду…"
          aria-label="Поиск исполнителя"
          className="w-full rounded-md bg-transparent px-2 py-1 text-sm text-foreground placeholder:text-[var(--fg4)] outline-none focus-ds"
        />
      </div>
      <div
        role="listbox"
        aria-label="Доступные исполнители"
        className="max-h-64 overflow-auto py-1"
      >
        {loading ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            Загрузка…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            Нет подходящих исполнителей
          </div>
        ) : (
          rows.map((opt) => {
            const isSelected = opt.id === value
            const tooltip = ELIGIBILITY_LABEL[opt.eligibility_reason] || ''
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => handleSelect(opt)}
                title={tooltip}
                className={[
                  'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors outline-none focus-ds',
                  isSelected
                    ? 'bg-[var(--primary-soft)]'
                    : 'hover:bg-muted',
                ].join(' ')}
              >
                <Avatar name={opt.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={[
                        'truncate',
                        isSelected
                          ? 'font-semibold text-[var(--primary-ink)]'
                          : 'font-medium text-foreground',
                      ].join(' ')}
                    >
                      {opt.name}
                    </span>
                    <RoleBadge role={opt.role} />
                  </div>
                  {opt.ref_code && (
                    <div className="mt-0.5 truncate font-mono text-xs text-[var(--fg4)]">
                      {opt.ref_code}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    aria-hidden
                    className="shrink-0 text-[var(--primary-ink)]"
                  >
                    <path
                      d="M3 8l3.5 3.5L13 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function Avatar({ name }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-[var(--fg2)]"
      aria-hidden
    >
      {userInitials(name)}
    </div>
  )
}

function RoleBadge({ role }) {
  const label = ROLE_LABEL[role] || role
  return (
    <span className="rounded bg-muted px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  )
}
