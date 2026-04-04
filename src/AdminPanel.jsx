import { useState, useEffect, useCallback } from 'react'

async function adminApi(endpoint, body = {}) {
  const res = await fetch(`/api/admin/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || json.error) return { data: null, error: { message: json.error || 'Unknown error' } }
  return { data: json.data, error: null }
}

const PERMISSIONS_CONFIG = [
  { key: 'can_view_revenue', label: 'Таблица выручки' },
  { key: 'can_view_chart',   label: 'График по часам' },
  { key: 'can_view_top',     label: 'Топ операторов' },
]

const ROLE_LABELS = { superadmin: 'Суперадмин', admin: 'Администратор', user: 'Пользователь' }
const ROLE_COLORS = {
  superadmin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  admin:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  user:       'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

function Badge({ role }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role] || ROLE_COLORS.user}`}>
      {ROLE_LABELS[role] || role}
    </span>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function InputField({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <input
        {...props}
        className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-colors disabled:opacity-60"
      />
    </div>
  )
}

function PermissionsCheckboxes({ permissions, onChange }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">Доступ</p>
      <div className="space-y-2">
        {PERMISSIONS_CONFIG.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!permissions[key]}
              onChange={e => onChange({ ...permissions, [key]: e.target.checked })}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated, callerId }) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'user',
    permissions: { can_view_revenue: true, can_view_chart: true, can_view_top: true },
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.email.trim() || !form.password) return
    setError(null)
    setSubmitting(true)
    const { error: err } = await adminApi('create-user', {
      caller_id: callerId,
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      permissions: form.permissions,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onCreated()
      onClose()
    }
  }

  return (
    <Modal title="Создать пользователя" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Email"
          type="email"
          placeholder="user@example.com"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          required
          disabled={submitting}
        />
        <InputField
          label="Пароль"
          type="password"
          placeholder="Минимум 6 символов"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          required
          minLength={6}
          disabled={submitting}
        />
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Роль</label>
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            disabled={submitting}
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-colors disabled:opacity-60"
          >
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
        </div>
        <PermissionsCheckboxes
          permissions={form.permissions}
          onChange={p => setForm(f => ({ ...f, permissions: p }))}
        />
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {submitting ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ user, onClose, onDone, callerId }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setError(null)
    setSubmitting(true)
    const { error: err } = await adminApi('update-password', {
      caller_id: callerId,
      user_id: user.id,
      new_password: password,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onDone()
      onClose()
    }
  }

  return (
    <Modal title={`Сменить пароль — ${user.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Новый пароль"
          type="password"
          placeholder="Минимум 6 символов"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          disabled={submitting}
        />
        <InputField
          label="Повторите пароль"
          type="password"
          placeholder="Повторите пароль"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          disabled={submitting}
        />
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60">
            Отмена
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edit Permissions Modal ────────────────────────────────────────────────────
function EditPermissionsModal({ user, onClose, onDone, callerId }) {
  const [permissions, setPermissions] = useState(user.permissions || {})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: err } = await adminApi('update-permissions', {
      caller_id: callerId,
      user_id: user.id,
      permissions,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onDone()
      onClose()
    }
  }

  return (
    <Modal title={`Права доступа — ${user.email}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <PermissionsCheckboxes permissions={permissions} onChange={setPermissions} />
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={submitting}
            className="flex-1 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60">
            Отмена
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel({ currentUser }) {
  const callerId = currentUser?.id
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState(null)
  const [permTarget, setPermTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    setFetchError(null)
    const { data, error } = await adminApi('list-users', { caller_id: callerId })
    setLoadingUsers(false)
    if (error) {
      setFetchError(error.message)
    } else {
      setUsers(data || [])
    }
  }, [callerId])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Деактивировать пользователя ${user.email}?`)) return
    setDeactivating(user.id)
    const { error } = await adminApi('deactivate-user', { caller_id: callerId, user_id: user.id })
    setDeactivating(null)
    if (error) {
      alert('Ошибка: ' + error.message)
    } else {
      showToast('Пользователь деактивирован')
      fetchUsers()
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Менеджеры
          {!loadingUsers && <span className="ml-2 text-xs font-normal text-slate-400">{users.length}</span>}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Создать
        </button>
      </div>

      {/* Body */}
      <div>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <svg className="w-5 h-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="text-slate-400 text-sm">Загрузка...</span>
            </div>
          ) : fetchError ? (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-red-500 flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-slate-400 py-16 text-sm">Нет пользователей</p>
          ) : (
            <div className="space-y-2">
              {users.map(u => (
                <div
                  key={u.id}
                  className={`flex flex-wrap items-center gap-3 p-4 rounded-xl border transition-colors ${
                    u.is_active === false
                      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 opacity-50'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700/20 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm flex-shrink-0">
                    {u.email[0].toUpperCase()}
                  </div>

                  {/* Email + role */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{u.email}</p>
                      <Badge role={u.role} />
                      {u.is_active === false && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">неактивен</span>
                      )}
                    </div>
                    {/* Permissions pills */}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {PERMISSIONS_CONFIG.map(({ key, label }) => (
                        u.permissions?.[key] ? (
                          <span key={key} className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                            {label}
                          </span>
                        ) : null
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  {u.is_active !== false && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setPermTarget(u)}
                        title="Изменить права"
                        className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setPasswordTarget(u)}
                        title="Сменить пароль"
                        className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeactivate(u)}
                        disabled={deactivating === u.id}
                        title="Деактивировать"
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-40"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <path d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728L5.636 5.636M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Modals */}
      {showCreate && (
        <CreateUserModal
          callerId={callerId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { showToast('Пользователь создан'); fetchUsers() }}
        />
      )}
      {passwordTarget && (
        <ChangePasswordModal
          callerId={callerId}
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onDone={() => showToast('Пароль обновлён')}
        />
      )}
      {permTarget && (
        <EditPermissionsModal
          callerId={callerId}
          user={permTarget}
          onClose={() => setPermTarget(null)}
          onDone={() => { showToast('Права обновлены'); fetchUsers() }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          {toast}
        </div>
      )}
    </div>
  )
}
