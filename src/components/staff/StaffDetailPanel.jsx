import { useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, Plus } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { supabase } from '../../supabaseClient'
import { useStaff } from '../../hooks/useStaff.js'
import { useSectionTitle } from '../../hooks/useSectionTitle.jsx'
import { hasPermission, isSuperadmin } from '../../lib/permissions.js'
import { validateFile, FILE_LIMITS } from '../../lib/clients.js'
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

function tabFromPathname(pathname) {
  if (pathname.endsWith('/attributes')) return 'attributes'
  if (pathname.endsWith('/permissions')) return 'permissions'
  if (pathname.endsWith('/activity')) return 'activity'
  return 'profile'
}

function tabToPath(refCode, tabKey) {
  const base = `/staff/${encodeURIComponent(refCode)}`
  return tabKey === 'profile' ? base : `${base}/${tabKey}`
}

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
  const { pathname } = useLocation()
  const activeTab = tabFromPathname(pathname)
  const { row, loading, error, reload } = useStaff(callerId, refCode)
  useSectionTitle(row?.alias || row?.first_name || 'Сотрудник', { backTo: '/staff' })
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [delError, setDelError] = useState(null)
  const avatarInputRef = useRef(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState(null)

  function bothChanged() {
    reload()
    onChanged?.()
  }

  const canEditAvatar = row && (user.id === row.id || hasPermission(user, 'create_users'))

  async function uploadAvatar(file) {
    if (!file) return
    setAvatarError(null)
    const v = validateFile(file, 'avatar')
    if (!v.valid) {
      setAvatarError(v.error)
      return
    }
    setAvatarBusy(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `staff-${row.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('staff-avatars')
        .upload(path, file, { upsert: false, contentType: file.type })
      if (uploadErr) throw new Error(uploadErr.message)
      const { data } = supabase.storage.from('staff-avatars').getPublicUrl(path)
      const { error: rpcErr } = await supabase.rpc('update_staff_profile', {
        p_caller_id: user.id,
        p_user_id: row.id,
        p_first_name: row.first_name,
        p_last_name: row.last_name,
        p_alias: row.alias,
        p_email: row.email,
        p_avatar_url: data.publicUrl,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      bothChanged()
    } catch (e) {
      setAvatarError(e.message || String(e))
    } finally {
      setAvatarBusy(false)
    }
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
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <nav
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          aria-label="Хлебные крошки"
        >
          <button
            type="button"
            onClick={() => (onBack ? onBack() : navigate('/staff'))}
            className="rounded hover:text-foreground"
            aria-label="Вернуться к списку сотрудников"
          >
            <span className="lg:hidden">← Список</span>
            <span className="hidden lg:inline">Сотрудники</span>
          </button>
          <span className="hidden lg:inline" aria-hidden>›</span>
          <span
            className="hidden truncate font-medium text-foreground lg:inline"
            title={`${row.first_name} ${row.last_name}`}
          >
            {row.first_name} {row.last_name}
          </span>
        </nav>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Сменить пароль
          </button>
          {!isSuperadmin(user) && hasPermission(user, 'create_users') && (
            <button
              type="button"
              onClick={() => setDelOpen(true)}
              disabled={row.has_pending_deletion}
              className="rounded-lg border border-[var(--danger)] bg-card px-3 py-1.5 text-xs font-medium text-[var(--danger-ink)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
            >
              {row.has_pending_deletion ? 'Запрос отправлен' : 'Запросить удаление'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative h-14 w-14 shrink-0">
              <input
                ref={avatarInputRef}
                type="file"
                accept={FILE_LIMITS.avatar.mimeTypes.join(',')}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  uploadAvatar(f)
                  e.target.value = ''
                }}
              />
              {row.avatar_url ? (
                <img
                  src={row.avatar_url}
                  alt=""
                  className={[
                    'h-14 w-14 rounded-full object-cover',
                    !row.is_active && 'opacity-60',
                  ].filter(Boolean).join(' ')}
                />
              ) : (
                <div
                  className={[
                    'flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold',
                    row.is_active ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground/60',
                  ].join(' ')}
                >
                  {initials || '?'}
                </div>
              )}
              {canEditAvatar && (
                <button
                  type="button"
                  title={row.avatar_url ? 'Заменить аватар' : 'Загрузить аватар'}
                  aria-label={row.avatar_url ? 'Заменить аватар' : 'Загрузить аватар'}
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarBusy}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {avatarBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                </button>
              )}
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
                {isSuperadmin(user) ? (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                    <Switch
                      size="sm"
                      checked={row.is_active}
                      disabled={!row.is_active}
                      onCheckedChange={(next) => {
                        if (!next) doDeactivate()
                      }}
                      aria-label={row.is_active ? 'Деактивировать сотрудника' : 'Сотрудник деактивирован'}
                    />
                    <span className={row.is_active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}>
                      {row.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </label>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <span
                      className={[
                        'h-2 w-2 rounded-full',
                        row.is_active ? 'bg-emerald-500' : 'bg-muted-foreground',
                      ].join(' ')}
                    />
                    {row.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                )}
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

          <div className="mb-4">
            <Tabs
              value={activeTab}
              onValueChange={(next) => navigate(tabToPath(row.ref_code, next))}
            >
              <TabsList>
                <TabsTrigger value="profile">Профиль</TabsTrigger>
                <TabsTrigger value="attributes">Атрибуты</TabsTrigger>
                <TabsTrigger value="permissions">Права</TabsTrigger>
                <TabsTrigger value="activity">Активность</TabsTrigger>
              </TabsList>
            </Tabs>
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
      {avatarError && (
        <p
          role="alert"
          className="fixed bottom-4 right-4 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm text-white"
        >
          {avatarError}
        </p>
      )}
    </div>
  )
}

