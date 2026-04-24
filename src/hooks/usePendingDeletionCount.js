import { useEffect, useState } from 'react'
import { useAuth } from '../useAuth.jsx'
import { supabase } from '../supabaseClient'

export function usePendingDeletionCount({ enabled = true } = {}) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled || !user?.id) return
    let cancelled = false
    const fetch = () => {
      supabase
        .rpc('count_pending_deletions', { p_caller_id: user.id })
        .then(({ data, error }) => {
          if (cancelled || error) return
          setCount(data ?? 0)
        })
    }
    fetch()
    const t = setInterval(fetch, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [enabled, user?.id])

  return count
}
