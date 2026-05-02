import { useMemo, useState } from 'react'
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { MasterDetailLayout, ListPane, SearchInput } from '../components/shell/index.js'
import { usePlatformList } from '../hooks/usePlatformList.js'
import { PlatformList } from '../components/platforms/PlatformList.jsx'
import { PlatformDetailPanel } from '../components/platforms/PlatformDetailPanel.jsx'
import { CreatePlatformSlideOut } from '../components/platforms/CreatePlatformSlideOut.jsx'
import { EmptyZero } from '../components/platforms/EmptyZero.jsx'
import { EmptyFilter } from '../components/platforms/EmptyFilter.jsx'
import { DetailEmptyHint } from '../components/platforms/DetailEmptyHint.jsx'

export function PlatformListPage() {
  const navigate = useNavigate()
  const { platformId } = useParams()
  const { rows, loading, error, reload } = usePlatformList()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((p) => p.name.toLowerCase().includes(q))
  }, [rows, search])

  const hasSearch = search.trim().length > 0
  const isEmpty = !loading && !error && filtered.length === 0
  const isZeroEmpty = isEmpty && rows.length === 0
  const isFilterEmpty = isEmpty && rows.length > 0

  const titleNode = (
    <span className="flex items-baseline gap-2">
      Платформы
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
      ariaLabel="Поиск платформ"
    />
  )

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
    <EmptyFilter onClearSearch={() => setSearch('')} />
  ) : (
    <PlatformList rows={filtered} selectedId={platformId ?? null} />
  )

  return (
    <>
      <MasterDetailLayout
        listPane={
          <ListPane
            title={titleNode}
            search={searchNode}
            filters={null}
            createButton={createButtonNode}
          >
            {listBody}
          </ListPane>
        }
        listLabel="Список платформ"
        detailEmpty={!platformId}
        detailLabel="Платформа"
      >
        <Outlet context={{ rows, reload }} />
      </MasterDetailLayout>

      {createOpen && (
        <CreatePlatformSlideOut
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            setCreateOpen(false)
            reload()
            if (newId) navigate(`/admin/platforms/${newId}`)
          }}
        />
      )}
    </>
  )
}

// Index child route — empty hint when no platform selected.
export function PlatformDetailEmpty() {
  return <DetailEmptyHint />
}

// Detail child route — pulls platformId from URL, passes reload from parent context.
export function PlatformDetailRoute() {
  const navigate = useNavigate()
  const { reload } = useOutletContext()
  return (
    <PlatformDetailPanel
      onBack={() => navigate('/admin/platforms')}
      onChanged={reload}
    />
  )
}
