import { useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { invalidateUserNotifications } from './useNotifications.js'
import { invalidateNotificationsUnseenCount } from './useNotificationsUnseenCount.js'

/**
 * Подписывается на INSERT-события в team_activity (не от current user)
 * и в deletion_requests; на любое событие → инвалидирует список
 * нотификаций + счётчик непросмотренных.
 *
 * task_activity покрыт отдельным useTaskRealtimeSync — он уже инвалидирует
 * нужные счётчики; для inbox достаточно слушать оставшиеся два источника.
 *
 * @param {number|null} userId
 */
export function useNotificationsRealtimeSync(userId) {
  useEffect(() => {
    if (!userId) return

    const fire = () => {
      invalidateUserNotifications()
      invalidateNotificationsUnseenCount(userId)
    }

    const teamCh = supabase
      .channel(`team-activity-notifs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_activity',
          filter: `actor_id=neq.${userId}`,
        },
        fire,
      )
      .subscribe()

    const delCh = supabase
      .channel(`deletion-requests-notifs-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deletion_requests' },
        fire,
      )
      .subscribe()

    const staffCh = supabase
      .channel(`staff-activity-notifs-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_activity',
          filter: `actor_id=neq.${userId}`,
        },
        fire,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(teamCh)
      supabase.removeChannel(delCh)
      supabase.removeChannel(staffCh)
    }
  }, [userId])
}
