// src/components/notifications/PushSettingsCard.jsx
import { useState } from 'react'
import { usePushPermission } from '../../hooks/usePushPermission.js'
import { enablePush, disablePush } from '../../lib/pushClient.js'

export function PushSettingsCard() {
  const { state, isSubscribed, iosHint, refresh } = usePushPermission()
  const [busy, setBusy] = useState(false)

  const onEnable = async () => {
    setBusy(true)
    try { await enablePush() } finally { setBusy(false); refresh() }
  }
  const onDisable = async () => {
    setBusy(true)
    try { await disablePush() } finally { setBusy(false); refresh() }
  }

  let body
  if (state === 'unsupported') {
    body = <p className="text-sm text-muted-foreground">Ваш браузер не поддерживает push.</p>
  } else if (iosHint) {
    body = (
      <p className="text-sm text-muted-foreground">
        Добавьте приложение на главный экран, чтобы получать уведомления на iPhone.
      </p>
    )
  } else if (state === 'denied') {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Заблокировано в настройках браузера. Включите уведомления для этого сайта в настройках сайта.
        </p>
      </div>
    )
  } else if (state === 'granted' && isSubscribed) {
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={onDisable}
        className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        Отключить на этом устройстве
      </button>
    )
  } else {
    // default OR (granted without subscription)
    body = (
      <button
        type="button"
        disabled={busy}
        onClick={onEnable}
        className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        Включить
      </button>
    )
  }

  return (
    <section className="rounded-md border border-border-strong p-4">
      <h2 className="mb-1 text-base font-medium text-foreground">Push-уведомления</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Уведомления настраиваются для каждого устройства/браузера отдельно.
      </p>
      {body}
    </section>
  )
}
