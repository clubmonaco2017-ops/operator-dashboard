import { useState, useEffect, useCallback } from 'react'
import { Modal, InputField, TextArea, Toast } from '../components/ui'
import { adminFetch } from '../lib/adminFetch.js'

async function platformApi(action, params = {}) {
  return adminFetch('/api/admin/platforms', { action, ...params })
}

async function uploadLogo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1]
      const { data, error } = await adminFetch('/api/admin/upload-logo', {
        file: base64,
        filename: file.name,
        content_type: file.type,
      })
      if (error) reject(new Error(error.message || 'Upload failed'))
      else resolve(data.url)
    }
    reader.onerror = () => reject(new Error('File read error'))
    reader.readAsDataURL(file)
  })
}

const EMPTY_CONTACT = { name: '', phone: '', email: '', role: '' }

function ContactFields({ contacts, onChange }) {
  const update = (i, field, value) => {
    const next = contacts.map((c, j) => j === i ? { ...c, [field]: value } : c)
    onChange(next)
  }
  const add = () => onChange([...contacts, { ...EMPTY_CONTACT }])
  const remove = (i) => onChange(contacts.filter((_, j) => j !== i))

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Контакты менеджеров
      </p>
      <div className="space-y-3">
        {contacts.map((c, i) => (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 relative">
            {contacts.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-2 right-2 text-slate-300 hover:text-red-500 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Имя"
                value={c.name}
                onChange={e => update(i, 'name', e.target.value)}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <input
                placeholder="Должность"
                value={c.role}
                onChange={e => update(i, 'role', e.target.value)}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Телефон"
                value={c.phone}
                onChange={e => update(i, 'phone', e.target.value)}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <input
                placeholder="Email"
                value={c.email}
                onChange={e => update(i, 'email', e.target.value)}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <input
              placeholder="Telegram (@username)"
              value={c.telegram || ''}
              onChange={e => update(i, 'telegram', e.target.value)}
              className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-medium flex items-center gap-1"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Добавить контакт
      </button>
    </div>
  )
}

function PlatformModal({ platform, onClose, onSaved, onDeleted }) {
  const isEdit = !!platform?.id
  const [form, setForm] = useState({
    name: platform?.name || '',
    logo_url: platform?.logo_url || '',
    contacts: platform?.contacts?.length ? platform.contacts : [{ ...EMPTY_CONTACT }],
    access_login: platform?.access_login || '',
    access_password: platform?.access_password || '',
    notes: platform?.notes || '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadLogo(file)
      setForm(f => ({ ...f, logo_url: url }))
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setError(null)
    setSubmitting(true)

    const payload = {
      ...form,
      contacts: form.contacts.filter(c => c.name || c.phone || c.email),
    }

    const { error: err } = isEdit
      ? await platformApi('update', { ...payload, id: platform.id })
      : await platformApi('create', payload)

    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onSaved()
      onClose()
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Удалить платформу "${platform.name}"?`)) return
    setSubmitting(true)
    const { error: err } = await platformApi('delete', { id: platform.id })
    setSubmitting(false)
    if (err) {
      setError(err.message)
    } else {
      onDeleted()
      onClose()
    }
  }

  return (
    <Modal title={isEdit ? 'Редактировать платформу' : 'Новая платформа'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Название"
          placeholder="Название платформы"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
          disabled={submitting}
        />

        {/* Logo */}
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Логотип</p>
          <div className="flex items-center gap-3">
            {form.logo_url ? (
              <img src={form.logo_url} alt="" className="h-12 max-w-24 rounded-xl object-contain border border-slate-200 dark:border-slate-700" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
            )}
            <label className={`text-sm font-medium cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${uploading ? 'opacity-50' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}>
              {uploading ? 'Загрузка...' : 'Выбрать файл'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading || submitting} />
            </label>
          </div>
        </div>

        <ContactFields
          contacts={form.contacts}
          onChange={contacts => setForm(f => ({ ...f, contacts }))}
        />

        {/* Access */}
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Доступ к площадке</p>
          <div className="space-y-2">
            <InputField
              label="Логин"
              placeholder="Логин"
              value={form.access_login}
              onChange={e => setForm(f => ({ ...f, access_login: e.target.value }))}
              disabled={submitting}
            />
            <div className="relative">
              <InputField
                label="Пароль"
                placeholder="Пароль"
                type={showPassword ? 'text' : 'password'}
                value={form.access_password}
                onChange={e => setForm(f => ({ ...f, access_password: e.target.value }))}
                disabled={submitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-7 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        <TextArea
          label="Заметки"
          placeholder="Дополнительная информация"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
          disabled={submitting}
        />

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60"
            >
              Удалить
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {submitting ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function PlatformsSection() {
  const [platforms, setPlatforms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editTarget, setEditTarget] = useState(null) // null = closed, {} = new, {id,...} = edit
  const [toast, setToast] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchPlatforms = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await platformApi('list')
    setLoading(false)
    if (err) setError(err.message)
    else setPlatforms(data || [])
  }, [])

  useEffect(() => { fetchPlatforms() }, [fetchPlatforms])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Платформы
          {!loading && <span className="ml-2 text-xs font-normal text-slate-400">{platforms.length}</span>}
        </h2>
        <button
          onClick={() => setEditTarget({})}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Добавить
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <svg className="w-5 h-5 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-slate-400 text-sm">Загрузка...</span>
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-red-500 flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : platforms.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-3 flex justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-slate-300 dark:text-slate-600"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
          <p className="text-sm text-slate-400 mb-3">Нет платформ</p>
          <button
            onClick={() => setEditTarget({})}
            className="text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700"
          >
            + Добавить первую платформу
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {platforms.map(p => (
            <button
              key={p.id}
              onClick={() => setEditTarget(p)}
              className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700/20 hover:bg-slate-50 dark:hover:bg-slate-700/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-2">
                {p.logo_url ? (
                  <img src={p.logo_url} alt="" className="h-10 max-w-20 rounded-lg object-contain" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                    {p.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{p.name}</p>
                  {p.contacts?.length > 0 && (
                    <p className="text-xs text-slate-400">{p.contacts.length} {p.contacts.length === 1 ? 'контакт' : 'контактов'}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal */}
      {editTarget && (
        <PlatformModal
          platform={editTarget.id ? editTarget : null}
          onClose={() => setEditTarget(null)}
          onSaved={() => { showToast(editTarget.id ? 'Платформа обновлена' : 'Платформа создана'); fetchPlatforms() }}
          onDeleted={() => { showToast('Платформа удалена'); fetchPlatforms() }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  )
}
