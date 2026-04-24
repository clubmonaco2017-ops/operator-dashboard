import { permissionGroups } from '../../lib/permissionGroups.js'

export function PermissionsTab({ row, canEdit, onToggle }) {
  const active = new Set(row.permissions ?? [])
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      {permissionGroups.map((g) => (
        <div key={g.title}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
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
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    aria-label={p.label}
                  />
                  <span className={canEdit ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}>
                    {p.label}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ))}
      {!canEdit && (
        <p className="text-xs text-slate-400">Редактирование прав требует права <code>manage_roles</code>.</p>
      )}
    </div>
  )
}
