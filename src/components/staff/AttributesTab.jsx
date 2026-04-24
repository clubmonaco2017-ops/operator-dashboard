import { useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'

const SHIFTS = ['ДЕНЬ', 'ВЕЧЕР', 'НОЧЬ']

export function AttributesTab({ row, onSaved }) {
  const { user } = useAuth()
  const canEdit = user.id === row.id || hasPermission(user, 'create_users')
  const attrs = row.attributes ?? {}
  const [shift, setShift] = useState(attrs.shift ?? '')
  const [panelId, setPanelId] = useState(attrs.panel_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const applyAttribute = async (key, value) => {
    if (!canEdit) return
    setSaving(true)
    setError(null)
    let err
    if (value === '' || value == null) {
      ;({ error: err } = await supabase.rpc('delete_user_attribute', {
        p_caller_id: user.id, p_user_id: row.id, p_key: key,
      }))
    } else {
      ;({ error: err } = await supabase.rpc('set_user_attribute', {
        p_caller_id: user.id, p_user_id: row.id, p_key: key, p_value: String(value),
      }))
    }
    setSaving(false)
    if (err) setError(err.message)
    else onSaved?.()
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(row.role === 'moderator' || row.role === 'operator') && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Смена</span>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              onBlur={() => applyAttribute('shift', shift)}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">— не задана —</option>
              {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        {row.role === 'moderator' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Admin panel ID</span>
            <input
              value={panelId}
              onChange={(e) => setPanelId(e.target.value)}
              onBlur={() => applyAttribute('panel_id', panelId)}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="например: 2509"
            />
          </label>
        )}

        {row.role === 'operator' && row.tableau_id && (
          <div className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-400">
            Tableau ID: <span className="font-mono">{row.tableau_id}</span>
          </div>
        )}
      </div>

      {saving && <p className="mt-3 text-xs text-slate-500">Сохранение…</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
        Команды и назначения — в следующем подплане. Изменения сохраняются при потере фокуса.
      </p>
    </div>
  )
}
