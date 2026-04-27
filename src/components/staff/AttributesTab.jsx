import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../useAuth.jsx'
import { hasPermission } from '../../lib/permissions.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const SHIFTS = ['ДЕНЬ', 'ВЕЧЕР', 'НОЧЬ']

export function AttributesTab() {
  const { row, onChanged } = useOutletContext()
  const onSaved = onChanged
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
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(row.role === 'moderator' || row.role === 'operator') && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Смена</span>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              onBlur={() => applyAttribute('shift', shift)}
              disabled={!canEdit || saving}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground disabled:bg-muted"
            >
              <option value="">— не задана —</option>
              {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        {row.role === 'moderator' && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Admin panel ID</span>
            <Input
              value={panelId}
              onChange={(e) => setPanelId(e.target.value)}
              onBlur={() => applyAttribute('panel_id', panelId)}
              disabled={!canEdit || saving}
              className="w-full"
              placeholder="например: 2509"
            />
          </label>
        )}

        {row.role === 'operator' && row.tableau_id && (
          <div className="sm:col-span-2 text-sm text-muted-foreground">
            Tableau ID: <span className="font-mono">{row.tableau_id}</span>
          </div>
        )}
      </div>

      {saving && <p className="mt-3 text-xs text-muted-foreground">Сохранение…</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger-ink)]">{error}</p>}

      <p className="mt-4 text-xs text-[var(--fg4)]">
        Команды и назначения — в следующем подплане. Изменения сохраняются при потере фокуса.
      </p>
    </div>
  )
}
