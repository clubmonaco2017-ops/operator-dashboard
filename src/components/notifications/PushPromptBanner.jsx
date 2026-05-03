// src/components/notifications/PushPromptBanner.jsx
import { useState } from 'react'
import { usePushPermission } from '../../hooks/usePushPermission.js'
import { enablePush } from '../../lib/pushClient.js'

export const DISMISSED_KEY = 'push_prompt_dismissed_at'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function readDismissed() {
  try {
    const v = Number(localStorage.getItem(DISMISSED_KEY))
    if (!Number.isFinite(v) || v <= 0) return 0
    return v
  } catch { return 0 }
}

export function PushPromptBanner() {
  const { state, iosHint, refresh } = usePushPermission()
  const [dismissedAt, setDismissedAt] = useState(() => readDismissed())
  const [busy, setBusy] = useState(false)

  if (state !== 'default') return null
  if (dismissedAt && (Date.now() - dismissedAt) < SEVEN_DAYS_MS) return null

  const dismiss = () => {
    const ts = Date.now()
    try { localStorage.setItem(DISMISSED_KEY, String(ts)) } catch { /* ignore */ }
    setDismissedAt(ts)
  }
  const onEnable = async () => {
    setBusy(true)
    try { await enablePush() } finally { setBusy(false); refresh(); dismiss() }
  }

  return (
    <div
      role="region"
      aria-label="Push notifications prompt"
      className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border-strong bg-card p-3"
    >
      <div className="text-sm text-foreground">
        {iosHint
          ? 'Добавьте приложение на главный экран, чтобы получать уведомления на iPhone.'
          : 'Получайте уведомления, даже когда вкладка закрыта.'}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!iosHint && (
          <button
            type="button"
            disabled={busy}
            onClick={onEnable}
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Включить
          </button>
        )}
        <button
          type="button"
          aria-label="закрыть"
          onClick={dismiss}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          ×
        </button>
      </div>
    </div>
  )
}
