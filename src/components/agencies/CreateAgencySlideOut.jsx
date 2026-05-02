import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../supabaseClient.js'
import { ResponsiveSlideOut } from '@/components/ui/responsive-slide-out'
import { Button } from '@/components/ui/button'

export function CreateAgencySlideOut({ onClose, onCreated }) {
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
      if (!cancelled) setPlatforms(p ?? [])

      const { data: a } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (!cancelled) setAdmins(a ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = name.trim().length > 0 && platformId && !submitting

  const submit = async (e) => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('create_agency', {
      p_name: name.trim(),
      p_platform_id: platformId,
      p_admin_ids: selectedAdminIds,
    })
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    onCreated(data)
  }

  // Cmd/Ctrl+Enter → submit
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit(e)
    }
  }

  const toggleAdmin = (id) => {
    setSelectedAdminIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    )
  }

  const adminLabel = (a) =>
    a.first_name || a.last_name
      ? `${(a.first_name ?? '') + ' ' + (a.last_name ?? '')}`.trim() + ' · ' + a.email
      : a.email

  return (
    <ResponsiveSlideOut
      open
      onOpenChange={(next) => !next && onClose()}
      title="Новое агентство"
      desktopWidth="sm:max-w-md"
      onKeyDown={onKeyDown}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отменить
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {submitting ? 'Создаём…' : 'Создать'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block mb-1 text-sm font-medium">Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <label className="block">
          <span className="block mb-1 text-sm font-medium">Платформа</span>
          <select
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              — выбрать —
            </option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="block mb-1 text-sm font-medium">Админы (опционально)</span>
          {selectedAdminIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {selectedAdminIds.map((id) => {
                const a = admins.find((x) => x.id === id)
                if (!a) return null
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                  >
                    {adminLabel(a)}
                    <button
                      type="button"
                      onClick={() => toggleAdmin(id)}
                      aria-label={`Убрать ${adminLabel(a)}`}
                      className="hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          {admins.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              Нет admin-пользователей. Создай в /staff.
            </p>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2 space-y-1">
              {admins.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={selectedAdminIds.includes(a.id)}
                    onChange={() => toggleAdmin(a.id)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{adminLabel(a)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive break-words" role="alert">
            {error}
          </p>
        )}
      </form>
    </ResponsiveSlideOut>
  )
}
