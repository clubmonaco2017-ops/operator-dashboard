import { Link } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const shortRole = {
  superadmin: 'СА', admin: 'Адм', moderator: 'Мод', teamlead: 'ТЛ', operator: 'ОП',
}

export function StaffCardList({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">Сотрудников нет</div>
    )
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
      {rows.map((u) => {
        const initials = (u.first_name?.[0] ?? '').toUpperCase() + (u.last_name?.[0] ?? '').toUpperCase()
        return (
          <li key={u.id}>
            <Link
              to={`/staff/${encodeURIComponent(u.ref_code)}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {initials || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={['truncate text-sm font-medium', u.is_active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'].join(' ')}>
                    {u.first_name} {u.last_name}
                  </span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${roleBadge[u.role] ?? ''}`}>
                    {shortRole[u.role] ?? u.role}
                  </span>
                </div>
                <div className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                  {u.ref_code}
                </div>
              </div>
              <span
                className={[
                  'h-2 w-2 shrink-0 rounded-full',
                  u.is_active ? 'bg-emerald-500' : 'bg-slate-400',
                ].join(' ')}
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
