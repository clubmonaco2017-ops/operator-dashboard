import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../useAuth.jsx'
import AgencyTable from '../components/agencies/AgencyTable.jsx'
import AgencyCreateModal from '../components/agencies/AgencyCreateModal.jsx'
import AgencyDetailPanel from '../components/agencies/AgencyDetailPanel.jsx'

export default function AdminAgenciesPage() {
  const { user } = useAuth()
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('list_all_agencies')
    if (e) {
      setError(e.message)
      setAgencies([])
    } else {
      setAgencies(
        (data ?? []).map((r) => ({
          id: r.out_id,
          name: r.out_name,
          platform_id: r.out_platform_id,
          platform_name: r.out_platform_name,
          is_active: r.out_is_active,
          admin_count: r.out_admin_count,
          user_count: r.out_user_count,
          client_count: r.out_client_count,
          team_count: r.out_team_count,
          created_at: r.out_created_at,
        }))
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  if (user?.role !== 'superadmin') {
    return <div className="p-6 text-destructive">Доступ только для superadmin</div>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Агентства</h1>
          <p className="text-sm text-muted-foreground">
            Создание агентств, мягкая архивация, управление брендингом, контактами и админами.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          + Новое агентство
        </button>
      </div>
      {error && <p className="text-sm text-destructive break-words">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : agencies.length === 0 ? (
        <p className="text-sm text-muted-foreground">Агентств пока нет.</p>
      ) : (
        <AgencyTable
          agencies={agencies}
          onChange={reload}
          onSelect={(a) => setSelectedId(a.id)}
        />
      )}
      {createOpen && (
        <AgencyCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); reload() }}
        />
      )}
      {selectedId && (
        <AgencyDetailPanel
          agencyId={selectedId}
          onClose={() => setSelectedId(null)}
          onAfterSave={reload}
        />
      )}
    </div>
  )
}
