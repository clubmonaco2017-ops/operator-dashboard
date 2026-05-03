// src/lib/pushClient.js
import { supabase } from '../supabaseClient'

function getVapidPublicKey() {
  // Prefer Vite client env, fall back to plain process.env (used in vitest setups).
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY
  }
  return process.env?.VITE_VAPID_PUBLIC_KEY || ''
}

export function getPushState() {
  if (typeof navigator === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator)) return 'unsupported'
  if (typeof PushManager === 'undefined') return 'unsupported'
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export function isIosNonStandalone() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent || '')
  if (!isIos) return false
  const standalone = (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true
  return !standalone
}

export async function ensureSWRegistered() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush() {
  const state = getPushState()
  if (state === 'unsupported') return { state }

  const reg = await ensureSWRegistered()
  if (!reg) return { state: 'unsupported' }

  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return { state: perm }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const key = getVapidPublicKey()
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }
  const json = typeof sub.toJSON === 'function'
    ? sub.toJSON()
    : { endpoint: sub.endpoint, keys: { p256dh: '', auth: '' } }

  await supabase.rpc('upsert_push_subscription', {
    p_endpoint:   json.endpoint,
    p_p256dh:     json.keys.p256dh,
    p_auth:       json.keys.auth,
    p_user_agent: navigator.userAgent || null,
  })
  return { state: 'granted', endpoint: json.endpoint }
}

export async function disablePush() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription?.()
  if (!sub) return
  try {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  } finally {
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
}
