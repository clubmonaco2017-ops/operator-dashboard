import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth.jsx'
import { useStaffList } from '../hooks/useStaffList.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { StaffFilterChips } from '../components/staff/StaffFilterChips.jsx'
import { StaffTable } from '../components/staff/StaffTable.jsx'
import { StaffCardList } from '../components/staff/StaffCardList.jsx'
import { hasPermission } from '../lib/permissions.js'

export function StaffListPage() {
  const { user, logout } = useAuth()
  const { rows, counts, loading, error } = useStaffList(user?.id)
  const [role, setRole] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (!q) return true
      return (
        (u.first_name ?? '').toLowerCase().includes(q) ||
        (u.last_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.ref_code ?? '').toLowerCase().includes(q) ||
        (u.alias ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, role, search])

  const canCreate = hasPermission(user, 'create_users')

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      <Sidebar user={user} onLogout={logout} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              Сотрудники
            </h1>
            <div className="flex-1" />
            {canCreate && (
              <Link
                to="/staff/new"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                + Добавить
              </Link>
            )}
          </header>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              placeholder="Поиск по имени, email, реф-коду…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:max-w-xs"
            />
            <StaffFilterChips counts={counts} value={role} onChange={setRole} />
          </div>

          {loading && (
            <p className="text-sm text-slate-500">Загрузка…</p>
          )}
          {error && (
            <p className="text-sm text-red-500">Ошибка: {error}</p>
          )}

          {!loading && !error && (
            <>
              <div className="hidden md:block">
                <StaffTable rows={filtered} />
              </div>
              <div className="md:hidden">
                <StaffCardList rows={filtered} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
