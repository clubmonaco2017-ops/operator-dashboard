import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../supabaseClient'
import { KpiCard } from '../KpiCard.jsx'

/**
 * Admin-scope all-overdue count.
 * Uses RPC `count_overdue_tasks` — scope (all vs own) decided server-side
 * via view_all_tasks permission check in the RPC body.
 */
export function OverdueAllCard({ user }) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('count_overdue_tasks')
      .then(({ data }) => {
        if (cancelled) return
        setCount(Number(data ?? 0))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <Link to="/tasks?filter=overdue" className="block">
      <KpiCard
        label="Просрочки задач (все)"
        value={loading ? '...' : count}
        icon={AlertTriangle}
        sublabel="→ открыть список"
        accentColor={count > 0 ? 'red' : undefined}
      />
    </Link>
  )
}
