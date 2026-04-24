import { Link, NavLink, useParams } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const roleLabel = {
  superadmin: 'Супер-Админ', admin: 'Администратор', moderator: 'Модератор',
  teamlead: 'Тим Лидер', operator: 'Оператор',
}

const tabBase = 'px-4 py-2 text-sm font-medium border-b-2 transition-colors'
const tabIdle = 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
const tabActive = 'border-indigo-600 text-slate-800 dark:text-slate-100'

export function StaffPageShell({ row, headerActions, children }) {
  const initials =
    (row.first_name?.[0] ?? '').toUpperCase() + (row.last_name?.[0] ?? '').toUpperCase()

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        <Link to="/staff" className="hover:underline">Сотрудники</Link>
        <span className="mx-2">›</span>
        <span className="text-slate-700 dark:text-slate-300">{row.first_name} {row.last_name}</span>
      </nav>

      <div className="mb-4 flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
          {initials || '?'}
          <button
            type="button"
            title="Загрузить аватар (в разработке)"
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-indigo-600 text-xs text-white dark:border-slate-800"
            onClick={(e) => e.preventDefault()}
          >
            +
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {row.first_name} {row.last_name}
            </h1>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge[row.role] ?? ''}`}>
              {roleLabel[row.role] ?? row.role}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              <span className={['h-2 w-2 rounded-full', row.is_active ? 'bg-emerald-500' : 'bg-slate-400'].join(' ')} />
              {row.is_active ? 'Активен' : 'Неактивен'}
            </span>
            {row.has_pending_deletion && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                Запрос на удаление
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono dark:bg-slate-900">{row.ref_code}</span>
            <span>{row.email}</span>
            <span>Создан {new Date(row.created_at).toLocaleDateString('ru-RU')}</span>
          </div>
        </div>

        {headerActions && <div className="flex flex-shrink-0 gap-2">{headerActions}</div>}
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <TabLink refCode={row.ref_code} tab="" label="Профиль" />
        <TabLink refCode={row.ref_code} tab="attributes" label="Атрибуты" />
        <TabLink refCode={row.ref_code} tab="permissions" label="Права" />
        <TabLink refCode={row.ref_code} tab="activity" label="Активность" />
      </div>

      <div>{children}</div>
    </div>
  )
}

function TabLink({ refCode, tab, label }) {
  return (
    <NavLink
      to={tab ? `/staff/${encodeURIComponent(refCode)}/${tab}` : `/staff/${encodeURIComponent(refCode)}`}
      end
      className={({ isActive }) => `${tabBase} ${isActive ? tabActive : tabIdle}`}
    >
      {label}
    </NavLink>
  )
}
