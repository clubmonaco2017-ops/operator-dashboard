import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useStaff } from '../../hooks/useStaff.js'
import { hasPermission, isSuperadmin } from '../../lib/permissions.js'
import { ChangePasswordModal } from './ChangePasswordModal.jsx'
import { DeleteRequestModal } from './DeleteRequestModal.jsx'

const ROLE_BADGE_COLOR = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const ROLE_LABEL = {
  superadmin: 'Супер-Админ',
  admin: 'Администратор',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

const TAB_BASE = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors'
const TAB_IDLE = 'border-transparent text-muted-foreground hover:text-foreground'
const TAB_ACTIVE = 'border-primary text-foreground'

/**
 * Detail-панель открытого сотрудника.
 *
 * @param {object} props
 * @param {string} props.callerId
 * @param {object} props.user
 * @param {string} props.refCode
 * @param {function} props.onChanged — callback после изменений (reload master)
 * @param {function} props.onBack — back to list (mobile)
 */
export function StaffDetailPanel({ callerId, user, refCode, onChanged, onBack }) {
  const navigate = useNavigate()
  const { row, loading, error, reload } = useStaff(callerId, refCode)
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [delError, setDelError] = useState(null)

  function bothChanged() {
    reload()
    onChanged?.()
  }

  async function submitDeletion(reason) {
    setDelSubmitting(true)
    setDelError(null)
    const { error: err } = await supabase.rpc('request_deletion', {
      p_caller_id: user.id,
      p_target_user: row.id,
      p_reason: reason,
    })
    setDelSubmitting(false)
    if (err) {
      setDelError(err.message)
      return
    }
    setDelOpen(false)
    bothChanged()
  }

  async function doDeactivate() {
    if (!confirm('Деактивировать сотрудника?')) return
    const { error: err } = await supabase.rpc('deactivate_staff', {
      p_caller_id: user.id,
      p_user_id: row.id,
    })
    if (err) {
      alert(err.message)
      return
    }
    bothChanged()
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка…</div>
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-[var(--danger-ink)]" role="alert">
        Ошибка: {error}
      </div>
    )
  }
  if (!row) return null

  const initials =
    (row.first_name?.[0] ?? '').toUpperCase() +
    (row.last_name?.[0] ?? '').toUpperCase()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => onBack?.()}
          className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
          aria-label="Назад к списку сотрудников"
        >
          <ChevronLeft size={18} />
        </button>
        <Link
          to="/staff"
          className="hidden items-center gap-1 rounded-md p-1 text-xs text-muted-foreground hover:text-foreground sm:flex"
        >
          <ChevronLeft size={14} /> Сотрудники
        </Link>
        <div className="flex-1" />
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Сменить пароль
          </button>
          {isSuperadmin(user) ? (
            <button
              type="button"
              onClick={doDeactivate}
              disabled={!row.is_active}
              className="rounded-lg border border-[var(--danger)] bg-card px-3 py-1.5 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
            >
              Деактивировать
            </button>
          ) : (
            hasPermission(user, 'create_users') && (
              <button
                type="button"
                onClick={() => setDelOpen(true)}
                disabled={row.has_pending_deletion}
                className="rounded-lg border border-[var(--danger)] bg-card px-3 py-1.5 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
              >
                {row.has_pending_deletion ? 'Запрос отправлен' : 'Запросить удаление'}
              </button>
            )
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-start sm:gap-6">
            <div
              className={[
                'relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold',
                row.is_active ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground/60',
              ].join(' ')}
            >
              {initials || '?'}
              <button
                type="button"
                title="Загрузить аватар (в разработке)"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-xs text-primary-foreground"
                onClick={(e) => e.preventDefault()}
              >
                +
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">
                  {row.first_name} {row.last_name}
                </h1>
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    ROLE_BADGE_COLOR[row.role] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ROLE_LABEL[row.role] ?? row.role}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground',
                    ].join(' ')}
                  />
                  {row.is_active ? 'Активен' : 'Неактивен'}
                </span>
                {row.has_pending_deletion && (
                  <span className="inline-flex items-center rounded-full bg-[var(--danger-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--danger-ink)]">
                    Запрос на удаление
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-mono">{row.ref_code}</span>
                <span>{row.email}</span>
                <span>Создан {new Date(row.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
          </div>

          <div className="mb-4 flex gap-1 border-b border-border">
            <TabLink refCode={row.ref_code} tab="" label="Профиль" />
            <TabLink refCode={row.ref_code} tab="attributes" label="Атрибуты" />
            <TabLink refCode={row.ref_code} tab="permissions" label="Права" />
            <TabLink refCode={row.ref_code} tab="activity" label="Активность" />
          </div>

          <div>
            <Outlet context={{ row, callerId, user, onChanged: bothChanged, navigate }} />
          </div>
        </div>
      </div>

      {pwOpen && (
        <ChangePasswordModal
          userId={row.id}
          onClose={() => setPwOpen(false)}
          onDone={() => bothChanged()}
        />
      )}
      {delOpen && (
        <DeleteRequestModal
          targetUserId={row.id}
          targetName={`${row.first_name} ${row.last_name}`}
          submitting={delSubmitting}
          onClose={() => setDelOpen(false)}
          onSubmit={submitDeletion}
        />
      )}
      {delError && (
        <p
          role="alert"
          className="fixed bottom-4 right-4 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm text-white"
        >
          {delError}
        </p>
      )}
    </div>
  )
}

function TabLink({ refCode, tab, label }) {
  return (
    <NavLink
      to={
        tab
          ? `/staff/${encodeURIComponent(refCode)}/${tab}`
          : `/staff/${encodeURIComponent(refCode)}`
      }
      end
    >
      {({ isActive }) => (
        <span
          className={`${TAB_BASE} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          aria-current={isActive ? 'page' : undefined}
        >
          {label}
        </span>
      )}
    </NavLink>
  )
}
