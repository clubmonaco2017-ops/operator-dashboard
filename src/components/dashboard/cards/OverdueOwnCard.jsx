import { Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUserOverdueCount } from '../../../hooks/useUserOverdueCount.js'
import { KpiCard } from '../KpiCard.jsx'

export function OverdueOwnCard({ user }) {
  const { count, loading } = useUserOverdueCount(user?.id ?? null)

  return (
    <Link to="/tasks" className="block">
      <KpiCard
        label="Мои просрочки"
        value={loading ? '...' : count}
        icon={Inbox}
        sublabel="→ открыть инбокс"
        accentColor={count > 0 ? 'red' : undefined}
      />
    </Link>
  )
}
