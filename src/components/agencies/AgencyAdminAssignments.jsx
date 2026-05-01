import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

export default function AgencyAdminAssignments({ agencyId }) {
  const [allAdmins, setAllAdmins] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setError(null)
      const { data: admins, error: aErr } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      if (aErr) {
        setError(aErr.message)
        setLoading(false)
        return
      }
      setAllAdmins(admins ?? [])

      const { data: links, error: lErr } = await supabase.rpc('list_agency_admins', {
        p_agency_id: agencyId,
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
  }, [agencyId])

  const toggle = async (adminId) => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (assigned.has(adminId)) {
      const { error: e } = await supabase.rpc('remove_admin_from_agency', {
        p_admin_id: adminId,
        p_agency_id: agencyId,
      })
      if (e) setError(e.message)
      else {
        const next = new Set(assigned)
        next.delete(adminId)
        setAssigned(next)
      }
    } else {
      const { error: e } = await supabase.rpc('assign_admin_to_agency', {
        p_admin_id: adminId,
        p_agency_id: agencyId,
      })
      if (e) setError(e.message)
      else setAssigned(new Set(assigned).add(adminId))
    }
    setBusy(false)
  }

  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
        Админы агентства
      </p>
      {error && <p className="text-sm text-destructive mb-2 break-words">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : allAdmins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет admin-пользователей. Создай в /staff.</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2">
          {allAdmins.map((a) => (
            <li key={a.id}
              className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-accent/40 rounded">
              <span className="text-sm truncate">
                {a.first_name || a.last_name
                  ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() + ' · '
                  : ''}
                {a.email}
              </span>
              <input
                type="checkbox"
                checked={assigned.has(a.id)}
                onChange={() => toggle(a.id)}
                disabled={busy}
                className="h-4 w-4"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
