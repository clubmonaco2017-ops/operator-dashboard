import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { hasPermission } from '../../lib/permissions.js'
import { permissionGroups } from '../../lib/permissionGroups.js'

export function PermissionsTab() {
  const { row, user, onChanged } = useOutletContext()
  const canEdit = hasPermission(user, 'manage_roles')
  const active = new Set(row.permissions ?? [])

  async function onToggle(key, next) {
    const rpcName = next ? 'grant_permission' : 'revoke_permission'
    const { error } = await supabase.rpc(rpcName, {
      p_target_user: row.id,
      p_permission: key,
    })
    if (error) {
      alert(error.message)
      return
    }
    onChanged?.()
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      {permissionGroups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg4)]">{g.title}</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {g.permissions.map((p) => {
              const checked = active.has(p.key)
              return (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    onChange={(e) => onToggle(p.key, e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-[var(--primary-ring)] disabled:opacity-50"
                    aria-label={p.label}
                  />
                  <span className={canEdit ? 'text-foreground' : 'text-muted-foreground'}>
                    {p.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
