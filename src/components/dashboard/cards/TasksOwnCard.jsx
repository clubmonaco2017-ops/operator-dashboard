import { Inbox } from 'lucide-react'
import { useUserOverdueCount } from '../../../hooks/useUserOverdueCount.js'
import { useUnreadTasksCount } from '../../../hooks/useUnreadTasksCount.js'
import { TasksKpiCard } from '../TasksKpiCard.jsx'

/**
 * Own-scope tasks dashboard card: shows unread + overdue counts for the
 * current user (assignee or creator). Click → /tasks (inbox).
 */
export function TasksOwnCard({ user }) {
  const userId = user?.id ?? null
  const { count: unread, loading: unreadLoading } = useUnreadTasksCount(userId)
  const { count: overdue, loading: overdueLoading } = useUserOverdueCount(userId)

  return (
    <TasksKpiCard
      label="Мои задачи"
      icon={Inbox}
      to="/tasks"
      unread={unread}
      overdue={overdue}
      loading={unreadLoading || overdueLoading}
    />
  )
}
