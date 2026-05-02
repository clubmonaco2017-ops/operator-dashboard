import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabaseClient.js'

export function AgencyAdminsTab() {
  const { agency } = useOutletContext()
  const [admins, setAdmins] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      const { data: users, error: uErr } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      if (uErr) {
        setError(uErr.message)
        setLoading(false)
        return
      }
      setAdmins(users ?? [])

      const { data: links, error: lErr } = await supabase.rpc('list_agency_admins', {
        p_agency_id: agency.id,
      })
      if (cancelled) return
      if (lErr) {
        setError(lErr.message)
        setLoading(false)
        return
      }
      setAssigned(new Set((links ?? []).map((l) => l.admin_id)))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [agency.id])

  const toggle = async (adminId) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const wasAssigned = assigned.has(adminId)
    // Optimistic update
    const next = new Set(assigned)
    if (wasAssigned) next.delete(adminId)
    else next.add(adminId)
    setAssigned(next)

    const rpcName = wasAssigned ? 'remove_admin_from_agency' : 'assign_admin_to_agency'
    const { error: err } = await supabase.rpc(rpcName, {
      p_admin_id: adminId,
      p_agency_id: agency.id,
    })
    if (err) {
      // Rollback
      setAssigned(assigned)
      setError(err.message)
    }
    setBusy(false)
  }

  const adminLabel = (a) =>
    a.first_name || a.last_name
      ? `${(a.first_name ?? '') + ' ' + (a.last_name ?? '')}`.trim() + ' · ' + a.email
      : a.email

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Админы агентства
      </p>
      {error && (
        <p className="text-sm text-destructive break-words" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Нет admin-пользователей. Создай в /staff.
        </p>
      ) : (
        <ul className="rounded-lg border border-border bg-card p-2 max-h-96 overflow-y-auto">
          {admins.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={assigned.has(a.id)}
                  onChange={() => toggle(a.id)}
                  disabled={busy}
                  className="h-4 w-4"
                />
                <span className="truncate">{adminLabel(a)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Изменения сохраняются автоматически.
      </p>
    </div>
  )
}
