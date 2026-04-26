import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../useAuth.jsx'
import { useStaff } from '../hooks/useStaff.js'
import { StaffPageShell } from '../components/staff/StaffPageShell.jsx'
import { ProfileTab } from '../components/staff/ProfileTab.jsx'
import { AttributesTab } from '../components/staff/AttributesTab.jsx'
import { PermissionsTab } from '../components/staff/PermissionsTab.jsx'
import { ActivityTab } from '../components/staff/ActivityTab.jsx'
import { ChangePasswordModal } from '../components/staff/ChangePasswordModal.jsx'
import { DeleteRequestModal } from '../components/staff/DeleteRequestModal.jsx'
import { hasPermission, isSuperadmin } from '../lib/permissions.js'

export function StaffDetailPage() {
  const { user } = useAuth()
  const { refCode, tab } = useParams()
  const { row, loading, error, reload } = useStaff(user?.id, refCode)
  const [pwOpen, setPwOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [delSubmitting, setDelSubmitting] = useState(false)
  const [delError, setDelError] = useState(null)

  const onToggle = async (key, next) => {
    if (!row) return
    const rpcName = next ? 'grant_permission' : 'revoke_permission'
    const { error: err } = await supabase.rpc(rpcName, {
      p_caller_id: user.id, p_target_user: row.id, p_permission: key,
    })
    if (err) { alert(err.message); return }
    reload()
  }

  const submitDeletion = async (reason) => {
    setDelSubmitting(true)
    setDelError(null)
    const { error: err } = await supabase.rpc('request_deletion', {
      p_caller_id: user.id, p_target_user: row.id, p_reason: reason,
    })
    setDelSubmitting(false)
    if (err) { setDelError(err.message); return }
    setDelOpen(false)
    reload()
  }

  const doDeactivate = async () => {
    if (!confirm('Деактивировать сотрудника?')) return
    const { error: err } = await supabase.rpc('deactivate_staff', {
      p_caller_id: user.id, p_user_id: row.id,
    })
    if (err) { alert(err.message); return }
    reload()
  }

  return (
    <div className="p-4 sm:p-6">
        {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
        {error && <p className="text-sm text-red-500">Ошибка: {error}</p>}
        {row && (
          <StaffPageShell
            row={row}
            headerActions={
              <>
                <button
                  onClick={() => setPwOpen(true)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Сменить пароль
                </button>
                {isSuperadmin(user) ? (
                  <button
                    onClick={doDeactivate}
                    disabled={!row.is_active}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                  >
                    Деактивировать
                  </button>
                ) : (
                  hasPermission(user, 'create_users') && (
                    <button
                      onClick={() => setDelOpen(true)}
                      disabled={row.has_pending_deletion}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                    >
                      {row.has_pending_deletion ? 'Запрос отправлен' : 'Запросить удаление'}
                    </button>
                  )
                )}
              </>
            }
          >
            {tab === undefined && <ProfileTab row={row} onSaved={reload} />}
            {tab === 'attributes' && <AttributesTab row={row} onSaved={reload} />}
            {tab === 'permissions' && (
              <PermissionsTab
                row={row}
                canEdit={hasPermission(user, 'manage_roles')}
                onToggle={onToggle}
              />
            )}
            {tab === 'activity' && <ActivityTab />}
          </StaffPageShell>
        )}

        {pwOpen && row && (
          <ChangePasswordModal
            userId={row.id}
            onClose={() => setPwOpen(false)}
            onDone={() => reload()}
          />
        )}
        {delOpen && row && (
          <DeleteRequestModal
            targetUserId={row.id}
            targetName={`${row.first_name} ${row.last_name}`}
            submitting={delSubmitting}
            onClose={() => setDelOpen(false)}
            onSubmit={submitDeletion}
          />
        )}
        {delError && <p className="fixed bottom-4 right-4 rounded-lg bg-red-600 px-4 py-2 text-sm text-white">{delError}</p>}
    </div>
  )
}
