import { useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUnreadTasksCount } from './useUnreadTasksCount.js'
import { invalidateUserTaskList } from './useTaskList.js'
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'

/**
 * Subscribes to task_activity INSERT events via Supabase Realtime.
 * Filters server-side: actor_id != current user (skip own actions).
 * On event → invalidate unread counter + task list.
 *
 * Mount once per session (AppShell). Channel lives until userId changes
 * or component unmounts.
 *
 * @param {number|null} userId
 */
export function useTaskRealtimeSync(userId) {
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`task-activity-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity',
          filter: `actor_id=neq.${userId}`,
        },
        () => {
          invalidateUnreadTasksCount(userId)
          invalidateUserTaskList()
          invalidateUserNotifications()
          invalidateNotificationsUnseenCount(userId)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])
}
