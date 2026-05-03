// src/hooks/usePushPermission.js
import { useCallback, useEffect, useState } from 'react'
import { getPushState, isIosNonStandalone, ensureSWRegistered } from '../lib/pushClient.js'

/**
 * Reactive snapshot of push permission + subscription state.
 *
 * Returns:
 *   state         — 'unsupported' | 'default' | 'granted' | 'denied'
 *   supported     — true if state !== 'unsupported'
 *   isSubscribed  — true iff browser has a PushSubscription
 *   iosHint       — true on iOS Safari outside standalone PWA mode
 *   refresh()     — re-read state and isSubscribed
 */
export function usePushPermission() {
  const [state, setState] = useState(() => getPushState())
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [iosHint, setIosHint] = useState(() => isIosNonStandalone())

  const checkSubscription = useCallback(() => {
    ensureSWRegistered()
      .then((reg) => reg?.pushManager?.getSubscription?.())
      .then((sub) => setIsSubscribed(!!sub))
      .catch(() => setIsSubscribed(false))
  }, [])

  const refresh = useCallback(() => {
    setState(getPushState())
    setIosHint(isIosNonStandalone())
    checkSubscription()
  }, [checkSubscription])

  useEffect(() => {
    checkSubscription()
  })

  useEffect(() => {
    const onVis = () => refresh()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis)
      }
    }
  }, [refresh])

  return { state, supported: state !== 'unsupported', isSubscribed, iosHint, refresh }
}
