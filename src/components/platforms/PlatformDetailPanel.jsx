import { useState } from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlatformDetail } from '../../hooks/usePlatformDetail.js'
import { DeletePlatformDialog } from './DeletePlatformDialog.jsx'
import { DetailEmptyHint } from './DetailEmptyHint.jsx'

const TABS = [
  { value: 'branding', label: 'Бренд' },
  { value: 'contacts', label: 'Контакты' },
]

function pluralize(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  let form
  if (m100 >= 11 && m100 <= 14) form = many
  else if (m10 === 1) form = one
  else if (m10 >= 2 && m10 <= 4) form = few
  else form = many
  return `${n} ${form}`
}

export function PlatformDetailPanel({ onBack, onChanged }) {
  const { platformId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const { rows, reload: reloadList } = useOutletContext()
  const platform = usePlatformDetail(rows, platformId)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const segments = location.pathname.split('/')
  const lastSegment = segments[segments.length - 1]
  const currentTab = TABS.some((t) => t.value === lastSegment) ? lastSegment : 'branding'

  if (!platform) {
    return <DetailEmptyHint error="Платформа не найдена" />
  }

  const handleAfterChange = () => {
    reloadList()
    onChanged?.()
  }

  const contactsCount = Array.isArray(platform.contacts) ? platform.contacts.length : 0

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
              <h1 className="truncate text-xl font-semibold">{platform.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {pluralize(contactsCount, 'контакт', 'контакта', 'контактов')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
            Удалить
          </Button>
        </div>

        <Tabs
          value={currentTab}
          onValueChange={(v) => navigate(`/admin/platforms/${platformId}/${v}`)}
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
        <Outlet context={{ platform, reload: handleAfterChange }} />
      </main>

      {deleteOpen && (
        <DeletePlatformDialog
          platform={platform}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false)
            handleAfterChange()
            navigate('/admin/platforms')
          }}
        />
      )}
    </div>
  )
}
