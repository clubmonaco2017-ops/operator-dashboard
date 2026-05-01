import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MoreVertical } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAgencyDetail } from '../../hooks/useAgencyDetail.js'
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
              <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                <span className="truncate">{agency.platform_name ?? '—'}</span>
                <span>·</span>
                {agency.is_active ? (
                  <Badge variant="outline">Активно</Badge>
                ) : (
                  <Badge variant="secondary">Архив</Badge>
                )}
              </p>
            </div>
          </div>
          {agency.is_active && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Меню действий">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setArchiveOpen(true)}
                  className="text-destructive"
                >
                  Архивировать
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
            navigate('/admin/agencies')
          }}
        />
      )}
    </div>
  )
}
