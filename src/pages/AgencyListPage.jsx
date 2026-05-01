import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { useAgencyList } from '../hooks/useAgencyList.js'
import { AgencyList } from '../components/agencies/AgencyList.jsx'
import { AgencyFilterChips } from '../components/agencies/AgencyFilterChips.jsx'
import { AgencyDetailPanel } from '../components/agencies/AgencyDetailPanel.jsx'
import { CreateAgencySlideOut } from '../components/agencies/CreateAgencySlideOut.jsx'
import { EmptyZero } from '../components/agencies/EmptyZero.jsx'
import { EmptyFilter } from '../components/agencies/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/agencies/DetailEmptyHint.jsx'

export function AgencyListPage() {
  const navigate = useNavigate()
  const { agencyId } = useParams()
  const { rows, loading, error, reload } = useAgencyList()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((a) => {
      if (status === 'active' && !a.is_active) return false
      if (status === 'archive' && a.is_active) return false
      if (q && !a.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, status, search])

  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Агентства
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {filtered.length}
      </span>
    </span>
  )

  const searchNode = (
    <SearchInput
      placeholder="Поиск по названию…"
      value={search}
      onChange={setSearch}
      ariaLabel="Поиск агентств"
    />
  )

  const filtersNode = !isZeroEmpty ? (
    <AgencyFilterChips value={status} onChange={setStatus} />
  ) : null

  const createButtonNode = (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      + Новое
    </Button>
  )

  const listBody = error ? (
    <p className="px-4 py-6 text-sm text-destructive" role="alert">
      Ошибка: {error}
    </p>
  ) : loading ? (
    <p className="px-4 py-6 text-sm text-muted-foreground">Загрузка…</p>
  ) : isZeroEmpty ? (
    <EmptyZero onCreate={() => setCreateOpen(true)} />
  ) : isFilterEmpty ? (
    <EmptyFilter
      hasSearch={hasSearch}
      status={status}
      onClearSearch={() => setSearch('')}
      onResetStatus={() => setStatus('active')}
    />
  ) : (
    <AgencyList rows={filtered} selectedId={agencyId ?? null} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={filtersNode}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
        listLabel="Список агентств"
        detailEmpty={!agencyId}
        detailLabel="Агентство"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreateAgencySlideOut
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`/admin/agencies/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — empty hint when no agency selected.
export function AgencyDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls agencyId from URL, passes reload from parent context.
export function AgencyDetailRoute() {
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <AgencyDetailPanel
      onBack={() => navigate('/admin/agencies')}
      onChanged={reload}
    />
  )
}
