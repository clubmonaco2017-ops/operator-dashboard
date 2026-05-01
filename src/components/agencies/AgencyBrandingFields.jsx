import { useState } from 'react'
import { adminFetch } from '../../lib/adminFetch.js'

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

export default function AgencyBrandingFields({ value, onChange, disabled = false }) {
  // value: { logo_url, access_login, access_password, notes }
  const [showPassword, setShowPassword] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const url = await uploadLogo(file)
      onChange({ ...value, logo_url: url })
    } catch (err) {
      setUploadError(err.message)
    }
    setUploading(false)
  }

  return (
    <div className="space-y-4">
      {/* Logo */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Логотип</p>
        <div className="flex items-center gap-3">
          {value.logo_url ? (
            <img src={value.logo_url} alt="" className="h-12 max-w-24 rounded-xl object-contain border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/>
              </svg>
            </div>
          )}
          <label className={`text-sm font-medium cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${uploading || disabled ? 'opacity-50' : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'}`}>
            {uploading ? 'Загрузка...' : 'Выбрать файл'}
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploading || disabled} />
          </label>
        </div>
        {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
      </div>

      {/* Access */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Доступ</p>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Логин"
            value={value.access_login || ''}
            onChange={e => onChange({ ...value, access_login: e.target.value })}
            disabled={disabled}
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль"
              value={value.access_password || ''}
              onChange={e => onChange({ ...value, access_password: e.target.value })}
              disabled={disabled}
              className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 pr-9"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} disabled={disabled}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                {showPassword ? (
                  <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                ) : (
                  <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Заметки</p>
        <textarea
          placeholder="Дополнительная информация"
          value={value.notes || ''}
          onChange={e => onChange({ ...value, notes: e.target.value })}
          rows={3}
          disabled={disabled}
          className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        />
      </div>
    </div>
  )
}
