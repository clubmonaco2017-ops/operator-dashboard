import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

export default function AgencyCreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [platformId, setPlatformId] = useState('')
  const [platforms, setPlatforms] = useState([])
  const [admins, setAdmins] = useState([])
  const [selectedAdminIds, setSelectedAdminIds] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: p } = await supabase
        .from('platforms')
        .select('id, name')
        .order('name')
      if (cancelled) return
      setPlatforms(p ?? [])

      const { data: a } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      setAdmins(a ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !platformId) return
    setSubmitting(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('create_agency', {
      p_name: name.trim(),
      p_platform_id: platformId,
      p_admin_ids: selectedAdminIds,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Новое агентство</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Название*</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Платформа*</label>
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="" disabled>
                —
              </option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Админы (опционально)
            </label>
            {admins.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Нет ни одного admin-пользователя. Создай его сначала в /admin/users.
              </p>
            ) : (
              <select
                multiple
                value={selectedAdminIds.map(String)}
                onChange={(e) =>
                  setSelectedAdminIds(
                    Array.from(e.target.selectedOptions, (o) =>
                      parseInt(o.value, 10),
                    ),
                  )
                }
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm h-24"
              >
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                    {a.first_name || a.last_name
                      ? ` (${(a.first_name ?? '') + ' ' + (a.last_name ?? '')})`
                      : ''}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Зажми Cmd/Ctrl чтобы выбрать несколько.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive break-words">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm hover:bg-accent rounded-md"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !platformId}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Создаём…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
