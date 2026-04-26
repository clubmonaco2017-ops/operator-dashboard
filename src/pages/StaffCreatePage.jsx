import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../useAuth.jsx'
import { RefCodePreview } from '../components/staff/RefCodePreview.jsx'
import { defaultPermissions } from '../lib/defaultPermissions.js'
import { permissionGroups } from '../lib/permissionGroups.js'

const ROLES = [
  { value: 'admin',     label: 'Администратор' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'teamlead',  label: 'Тим Лидер' },
  { value: 'operator',  label: 'Оператор' },
]

export function StaffCreatePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [role, setRole] = useState('moderator')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [alias, setAlias] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [perms, setPerms] = useState(() => new Set(defaultPermissions('moderator')))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const setRoleAndPerms = (r) => {
    setRole(r)
    setPerms(new Set(defaultPermissions(r)))
  }

  const togglePerm = (key) => {
    setPerms((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const canSubmit = useMemo(() => {
    return (
      firstName.trim() &&
      lastName.trim() &&
      email.trim() &&
      password.length >= 6
    )
  }, [firstName, lastName, email, password])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc('create_staff', {
      p_caller_id: user.id,
      p_email: email.trim(),
      p_password: password,
      p_role: role,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_alias: alias.trim() || null,
      p_permissions: Array.from(perms),
    })

    if (rpcError) {
      setError(rpcError.message)
      setSubmitting(false)
      return
    }

    const { data: detail, error: detailErr } = await supabase.rpc('get_staff_detail', {
      p_caller_id: user.id,
      p_user_id: data,
    })
    if (detailErr || !detail?.[0]) {
      setError(detailErr?.message ?? 'Создано, но не удалось открыть карточку')
      setSubmitting(false)
      return
    }
    navigate(`/staff/${encodeURIComponent(detail[0].ref_code)}`)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
          <nav className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            <Link to="/staff" className="hover:underline">Сотрудники</Link>
            <span className="mx-2">›</span>
            Новый
          </nav>

          <h1 className="mb-6 text-2xl font-bold text-slate-800 dark:text-slate-100">
            Создать сотрудника
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Имя *</span>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Фамилия *</span>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Псевдоним</span>
                <input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Роль *</span>
                <select
                  value={role}
                  onChange={(e) => setRoleAndPerms(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Email *</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Пароль * (мин. 6 символов)</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Реф-код (предпросмотр)</div>
              <RefCodePreview role={role} firstName={firstName} lastName={lastName} />
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Права (по умолчанию для роли, можно менять)
              </div>
              <div className="space-y-3">
                {permissionGroups.map((g) => (
                  <div key={g.title}>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label key={p.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={perms.has(p.key)}
                            onChange={() => togglePerm(p.key)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-slate-700 dark:text-slate-300">{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <Link
                to="/staff"
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Отмена
              </Link>
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Создаётся…' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
    </div>
  )
}
