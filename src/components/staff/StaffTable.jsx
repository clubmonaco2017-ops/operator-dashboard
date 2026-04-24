import { Link } from 'react-router-dom'

const roleBadge = {
  superadmin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  admin:      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  moderator:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  teamlead:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  operator:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}
const roleLabel = {
  superadmin: 'Супер-Админ',
  admin: 'Админ',
  moderator: 'Модератор',
  teamlead: 'Тим Лидер',
  operator: 'Оператор',
}

function Avatar({ firstName, lastName, muted }) {
  const initials =
    (firstName?.[0] ?? '').toUpperCase() + (lastName?.[0] ?? '').toUpperCase()
  return (
    <div
      className={[
        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold',
        muted
          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
      ].join(' ')}
    >
      {initials || '?'}
    </div>
  )
}

function formatAttributes(attrs) {
  if (!attrs || Object.keys(attrs).length === 0) return '—'
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')
}

export function StaffTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <th className="px-4 py-3">Сотрудник</th>
            <th className="px-4 py-3">Реф-код</th>
            <th className="px-4 py-3">Роль</th>
            <th className="px-4 py-3">Атрибуты</th>
            <th className="px-4 py-3">Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr
              key={u.id}
              className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            >
              <td className="px-4 py-3">
                <Link
                  to={`/staff/${encodeURIComponent(u.ref_code)}`}
                  className="flex items-center gap-3 text-slate-800 hover:underline dark:text-slate-200"
                >
                  <Avatar firstName={u.first_name} lastName={u.last_name} muted={!u.is_active} />
                  <span className={!u.is_active ? 'text-slate-400' : ''}>
                    {u.first_name} {u.last_name}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                {u.ref_code}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleBadge[u.role] ?? ''}`}
                >
                  {roleLabel[u.role] ?? u.role}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                {formatAttributes(u.attributes)}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    className={[
                      'h-2 w-2 rounded-full',
                      u.is_active ? 'bg-emerald-500' : 'bg-slate-400',
                    ].join(' ')}
                  />
                  {u.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                Сотрудников нет
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
