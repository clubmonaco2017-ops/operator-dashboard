import { useAuth } from '../useAuth'
import { SectionAnalytics } from '../components/dashboard/SectionAnalytics.jsx'
import { SectionTasks } from '../components/dashboard/SectionTasks.jsx'
import { useSectionTitle } from '../hooks/useSectionTitle.jsx'

export function DashboardPage() {
  useSectionTitle('Дашборд')
  const { user } = useAuth()
  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      <SectionAnalytics user={user} />
      <SectionTasks user={user} />
    </div>
  )
}
