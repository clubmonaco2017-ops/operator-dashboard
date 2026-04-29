import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient.js'

export default function AgencyAdminAssignmentModal({ agency, onClose, onChanged }) {
  const [allAdmins, setAllAdmins] = useState([])
  const [assigned, setAssigned] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: admins, error: aErr } = await supabase
        .from('dashboard_users')
        .select('id, email, first_name, last_name')
        .eq('role', 'admin')
        .eq('is_active', true)
        .order('email')
      if (cancelled) return
      if (aErr) {
        setError(aErr.message)
        return
      }
      setAllAdmins(admins ?? [])

      const { data: links, error: lErr } = await supabase.rpc('list_agency_admins', {
        p_agency_id: agency.id,
      })
      if (cancelled) return
      if (lErr) {
        setError(lErr.message)
        return
      }
      setAssigned(new Set((links ?? []).map((l) => l.admin_id)))
    })()
    return () => {
      cancelled = true
    }
  }, [agency.id])

  const toggle = async (adminId) => {
    if (busy) return
    setBusy(true)
    setError(null)
    if (assigned.has(adminId)) {
      const { error: e } = await supabase.rpc('remove_admin_from_agency', {
        p_admin_id: adminId,
        p_agency_id: agency.id,
      })
      if (e) {
        setError(e.message)
      } else {
        const next = new Set(assigned)
        next.delete(adminId)
        setAssigned(next)
      }
    } else {
      const { error: e } = await supabase.rpc('assign_admin_to_agency', {
        p_admin_id: adminId,
        p_agency_id: agency.id,
      })
      if (e) {
        setError(e.message)
      } else {
        setAssigned(new Set(assigned).add(adminId))
      }
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg p-6 w-full max-w-md max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-semibold mb-2">
          Админы агентства «{agency.name}»
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Отметь чекбоксом, какие админы должны иметь доступ к этому агентству.
        </p>
        {error && (
          <p className="text-sm text-destructive mb-2 break-words">{error}</p>
        )}
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {allAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Нет ни одного admin-пользователя. Создай админа в legacy /admin/users
              (пока не сделана новая страница staff с ролью admin).
            </p>
          ) : (
            <ul className="space-y-1">
              {allAdmins.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 py-1.5 px-2 hover:bg-accent rounded"
                >
                  <span className="text-sm truncate">
                    {a.first_name || a.last_name
                      ? `${a.first_name ?? ''} ${a.last_name ?? ''} `.trim() + ' · '
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
        <div className="flex justify-end pt-4 mt-2 border-t border-border">
          <button
            type="button"
            onClick={() => {
              onChanged()
              onClose()
            }}
            className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )
}
