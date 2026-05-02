import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgencyDetail } from '../../hooks/useAgencyDetail.js'
import { supabase } from '../../supabaseClient.js'
import { ArchiveAgencyDialog } from './ArchiveAgencyDialog.jsx'
import { DetailEmptyHint } from './DetailEmptyHint.jsx'

const TABS = [
  { value: 'branding', label: 'Бренд' },
  { value: 'contacts', label: 'Контакты' },
  { value: 'admins',   label: 'Админы' },
]

export function AgencyDetailPanel({ onBack, onChanged }) {
  const { agencyId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const { agency, loading, error, reload } = useAgencyDetail(agencyId)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(null)

  // Determine current tab from URL last segment
  const segments = location.pathname.split('/')
  const lastSegment = segments[segments.length - 1]
  const currentTab = TABS.some((t) => t.value === lastSegment) ? lastSegment : 'branding'

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-border px-6 py-4 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
        </header>
      </div>
    )
  }

  if (error || !agency) {
    return <DetailEmptyHint error={error ?? 'Агентство не найдено'} />
  }

  const handleAfterChange = () => {
    reload()
    onChanged?.()
  }

  const handleRestore = async () => {
    setRestoring(true)
    setRestoreError(null)
    const { error: err } = await supabase.rpc('restore_agency', { p_agency_id: agency.id })
    setRestoring(false)
    if (err) {
      setRestoreError(err.message)
      return
    }
    handleAfterChange()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={onBack} aria-label="Назад">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{agency.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {agency.platform_name ?? '—'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <label className="flex items-center gap-2 text-sm">
              <span className={agency.is_active ? 'text-foreground' : 'text-muted-foreground'}>
                {agency.is_active ? 'Активно' : 'Архив'}
              </span>
              <Switch
                checked={agency.is_active}
                disabled={restoring}
                onCheckedChange={(checked) => {
                  if (checked && !agency.is_active) handleRestore()
                  else if (!checked && agency.is_active) setArchiveOpen(true)
                }}
                aria-label={
                  agency.is_active ? 'Архивировать агентство' : 'Восстановить агентство из архива'
                }
              />
            </label>
            {restoreError && (
              <p className="text-xs text-destructive break-words" role="alert">
                {restoreError}
              </p>
            )}
          </div>
        </div>

        <Tabs
          value={currentTab}
          onValueChange={(v) => navigate(`/admin/agencies/${agencyId}/${v}`)}
        >
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <Outlet context={{ agency, reload: handleAfterChange }} />
      </main>

      {archiveOpen && (
        <ArchiveAgencyDialog
          agency={agency}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => {
            setArchiveOpen(false)
            handleAfterChange()
          }}
        />
      )}
    </div>
  )
}
