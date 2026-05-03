// public/sw.js
//
// Web Push handler. Suppresses notification when an app tab is focused
// (existing in-app realtime already updates the inbox in that case),
// otherwise shows an OS-level notification with a deep link.

self.addEventListener('push', (event) => event.waitUntil(handlePush(event)))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/notifications'
  event.waitUntil(handleClick(url))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // Browser rotated keys. Best-effort re-subscribe; persist via window-side code on next page load.
  // The page will call upsert_push_subscription via getSubscription() in usePushPermission.
})

async function handlePush(event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const { title, body, url, tag } = data

  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const focused = wins.find((c) => c.visibilityState === 'visible' && c.focused)
  if (focused) {
    focused.postMessage({ type: 'push:received', payload: data })
    return
  }

  await self.registration.showNotification(title || 'Уведомление', {
    body: body || '',
    tag: tag || undefined,
    icon: '/icons/notification-192.png',
    badge: '/icons/badge-72.png',
    data: { url: url || '/notifications' },
    renotify: false,
  })
}

async function handleClick(url) {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const sameOrigin = wins.find((c) => {
    try { return new URL(c.url).origin === self.location.origin } catch { return false }
  })
  if (sameOrigin) {
    sameOrigin.postMessage({ type: 'push:navigate', url })
    if ('focus' in sameOrigin) await sameOrigin.focus()
    return
  }
  if (self.clients.openWindow) await self.clients.openWindow(url)
}
