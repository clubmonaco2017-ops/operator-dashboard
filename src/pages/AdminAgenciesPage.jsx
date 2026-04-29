import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useAuth } from '../useAuth.jsx'
import AgencyTable from '../components/agencies/AgencyTable.jsx'
import AgencyCreateModal from '../components/agencies/AgencyCreateModal.jsx'

export default function AdminAgenciesPage() {
  const { user } = useAuth()
  const [agencies, setAgencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('list_all_agencies')
    if (e) {
      setError(e.message)
      setAgencies([])
    } else {
      setAgencies(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  if (user?.role !== 'superadmin') {
    return (
      <div className="p-6 text-destructive">
        Доступ только для superadmin
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Управление агентствами</h1>
          <p className="text-sm text-muted-foreground">
            Создание агентств, мягкая архивация, назначение админов на агентства
            (admin → many agencies).
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
        <AgencyTable agencies={agencies} onChange={reload} />
      )}
      {createOpen && (
        <AgencyCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}
