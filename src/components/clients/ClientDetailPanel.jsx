import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, Briefcase, Calendar, BarChart3 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useClient } from '../../hooks/useClient.js'
import { useClientActions } from '../../hooks/useClientActions.js'
import { initials } from '../../lib/clients.js'
import { ProfileTab } from './ProfileTab.jsx'
import { PhotoGalleryTab } from './PhotoGalleryTab.jsx'
import { VideoGalleryTab } from './VideoGalleryTab.jsx'
import { ActivityCard } from './ActivityCard.jsx'
import { SummaryCard } from './SummaryCard.jsx'
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog.jsx'

const TAB_LABELS = {
  profile: 'Профиль',
  photos: 'Фото',
  videos: 'Видео',
}

/**
 * Detail-панель открытого клиента.
 *
 * @param {object} props
 * @param {number} props.callerId
 * @param {string|number} props.clientId
 * @param {'profile'|'photos'|'videos'} props.activeTab
 * @param {Array} props.siblings — массив клиентов из master (для pagination ‹ ›)
 * @param {function} props.onChanged — callback после изменений (reload master)
 */
export function ClientDetailPanel({ callerId, clientId, activeTab = 'profile', siblings = [], onChanged }) {
  const navigate = useNavigate()
  const { archiveClient, restoreClient } = useClientActions(callerId)
  const { row, loading, error, reload } = useClient(callerId, clientId)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  const { prev, next, position } = useMemo(() => {
    if (!siblings.length || !clientId) return { prev: null, next: null, position: 0 }
    const id = Number(clientId)
    const idx = siblings.findIndex((c) => c.id === id)
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
      position: idx + 1,
    }
  }, [siblings, clientId])

  if (loading && !row) return <DetailSkeleton />
  if (error) {
    return (
      <div className="px-6 py-10" role="alert">
        <p className="text-sm text-[var(--danger-ink)]">Ошибка: {error}</p>
        <button
          type="button"
          onClick={() => navigate('/clients')}
          className="mt-3 text-sm text-primary hover:underline rounded"
        >
          ← К списку
        </button>
      </div>
    )
  }
  if (!row) return null

  function bothChanged() {
    reload()
    onChanged?.()
  }

  async function toggleStatus() {
    if (statusBusy) return
    if (row.is_active) {
      setArchiveOpen(true)
      return
    }
    setStatusBusy(true)
    try {
      await restoreClient(row.id)
      bothChanged()
    } catch (e) {
      alert(`Не удалось восстановить: ${e.message}`)
    } finally {
      setStatusBusy(false)
    }
  }

  async function confirmArchive() {
    setStatusBusy(true)
    try {
      await archiveClient(row.id)
      setArchiveOpen(false)
      bothChanged()
    } catch (e) {
      alert(`Не удалось архивировать: ${e.message}`)
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: breadcrumb + status toggle + pagination */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3">
        <nav
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          aria-label="Хлебные крошки"
        >
          <button
            type="button"
            onClick={() => navigate('/clients')}
            className="rounded hover:text-foreground"
            // 8.H: на узких экранах — это «← Назад к списку»
            aria-label="Вернуться к списку клиентов"
          >
            <span className="lg:hidden">← Список</span>
            <span className="hidden lg:inline">Клиенты</span>
          </button>
          <span className="hidden lg:inline" aria-hidden>›</span>
          <span
            className="hidden truncate font-medium text-foreground lg:inline"
            title={row.name}
          >
            {row.name}
          </span>
        </nav>

        <div className="flex items-center gap-3">
          <StatusToggle active={row.is_active} busy={statusBusy} onToggle={toggleStatus} />
          {siblings.length > 0 && (
            <Pagination
              position={position}
              total={siblings.length}
              prev={prev}
              next={next}
              onGo={(c) => navigate(activeTab === 'profile' ? `/clients/${c.id}` : `/clients/${c.id}/${activeTab}`)}
            />
          )}
        </div>
      </div>

      {/* Header */}
      <header className="flex items-start gap-4 px-6 pt-5">
        {row.avatar_url ? (
          <img src={row.avatar_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-lg font-semibold text-[var(--primary-ink)]">
            {initials(row.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-xl font-bold text-foreground" title={row.name}>{row.name}</h1>
            {row.alias && (
              <span className="font-mono text-sm text-[var(--fg4)]">{row.alias}</span>
            )}
            <StatusPill active={row.is_active} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {row.platform_name && <Chip><Globe size={12} className="inline mr-1" />{row.platform_name}</Chip>}
            {row.agency_name && <Chip variant="violet"><Briefcase size={12} className="inline mr-1" />{row.agency_name}</Chip>}
            <Chip variant="muted"><Calendar size={12} className="inline mr-1" />{formatRuDate(row.created_at)}</Chip>
            {row.tableau_id && <Chip variant="muted"><BarChart3 size={12} className="inline mr-1" />{row.tableau_id}</Chip>}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 pt-4 pb-0">
        <Tabs
          value={activeTab}
          onValueChange={(next) =>
            navigate(next === 'profile' ? `/clients/${row.id}` : `/clients/${row.id}/${next}`)
          }
          aria-label="Разделы клиента"
        >
          <TabsList>
            {Object.entries(TAB_LABELS).map(([key, label]) => {
              const count =
                key === 'photos' ? row.photos_count : key === 'videos' ? row.videos_count : null
              return (
                <TabsTrigger key={key} value={key}>
                  {label}
                  {count != null && (
                    <span className="rounded-full border border-border bg-background px-1.5 text-[11px] font-medium tabular text-muted-foreground">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Body: tab content + right column (Activity + Summary) */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="grid grid-cols-1 gap-5 px-4 pt-3 pb-5 sm:px-6 xl:grid-cols-[minmax(0,1fr),320px]">
          <main className="min-w-0">
            {activeTab === 'profile' && (
              <ProfileTab callerId={callerId} client={row} onChanged={bothChanged} />
            )}
            {activeTab === 'photos' && (
              <PhotoGalleryTab callerId={callerId} client={row} onChanged={bothChanged} />
            )}
            {activeTab === 'videos' && (
              <VideoGalleryTab callerId={callerId} client={row} onChanged={bothChanged} />
            )}
          </main>
          <aside className="space-y-4">
            <ActivityCard callerId={callerId} clientId={row.id} />
            <SummaryCard client={row} />
          </aside>
        </div>
      </div>

      {archiveOpen && (
        <ArchiveConfirmDialog
          clientName={row.name}
          busy={statusBusy}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={confirmArchive}
        />
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusToggle({ active, busy, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className={[
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
        active
          ? 'border-[var(--success-soft)] bg-[var(--success-soft)] text-[var(--success-ink)] hover:opacity-80'
          : 'border-border bg-muted text-muted-foreground hover:bg-[var(--surface-3)]',
      ].join(' ')}
      title={active ? 'Кликнуть, чтобы архивировать' : 'Кликнуть, чтобы восстановить'}
      aria-label={active ? 'Архивировать клиента' : 'Восстановить клиента'}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[var(--success)]' : 'bg-[var(--fg4)]'}`} aria-hidden />
      {active ? 'Активна' : 'Архив'}
    </button>
  )
}

function Pagination({ position, total, prev, next, onGo }) {
  return (
    <div
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      role="group"
      aria-label="Навигация по клиентам"
    >
      <button
        type="button"
        onClick={() => prev && onGo(prev)}
        disabled={!prev}
        title={prev ? prev.name : 'Это первый клиент'}
        aria-label={prev ? `Предыдущий: ${prev.name}` : 'Предыдущий — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40"
      >
        ‹
      </button>
      <span className="px-1 font-mono tabular" aria-label={`Позиция ${position} из ${total}`}>
        {position}/{total}
      </span>
      <button
        type="button"
        onClick={() => next && onGo(next)}
        disabled={!next}
        title={next ? next.name : 'Это последний клиент'}
        aria-label={next ? `Следующий: ${next.name}` : 'Следующий — недоступно'}
        className="rounded-md border border-border px-1.5 py-0.5 hover:bg-muted disabled:opacity-40"
      >
        ›
      </button>
    </div>
  )
}

function Chip({ children, variant = 'default' }) {
  const styles = {
    default: 'border-[var(--primary-soft)] bg-[var(--primary-soft)] text-[var(--primary-ink)]',
    violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300',
    muted: 'border-border bg-card text-muted-foreground',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${styles[variant]}`}>
      {children}
    </span>
  )
}

function StatusPill({ active }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-[var(--success-soft)] text-[var(--success-ink)]'
          : 'bg-muted text-muted-foreground',
      ].join(' ')}
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[var(--success)]' : 'bg-[var(--fg4)]'}`} aria-hidden />
      {active ? 'Активна' : 'Архив'}
    </span>
  )
}

function DetailSkeleton() {
  // 8.B: skeleton имитирует реальную структуру (top-bar + header с круглым avatar
  // + tab-row + content-grid 2 колонки), чтобы layout не прыгал.
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Загрузка профиля клиента">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
      </div>

      {/* Header */}
      <header className="flex items-start gap-4 px-6 pt-5">
        <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/5 animate-pulse rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-5 w-24 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </header>

      {/* Tab row */}
      <div className="border-b border-border px-6">
        <nav className="mt-4 flex gap-6 pb-3">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-12 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted/70" />
        </nav>
      </div>

      {/* Content grid */}
      <div className="flex-1 overflow-hidden bg-background">
        <div className="grid grid-cols-1 gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1fr),320px]">
          <div className="surface-card h-48 animate-pulse" />
          <div className="space-y-4">
            <div className="surface-card h-32 animate-pulse" />
            <div className="surface-card h-40 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRuDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `с ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}
