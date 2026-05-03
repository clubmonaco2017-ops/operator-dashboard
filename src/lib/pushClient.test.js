// src/lib/pushClient.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const supabaseRpc = vi.fn()
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: supabaseRpc },
}))

// Provide test-only globals.
const setNotification = (perm) => {
  globalThis.Notification = {
    permission: perm,
    requestPermission: vi.fn().mockResolvedValue(perm === 'default' ? 'granted' : perm),
  }
}

const fakeSubscribe = vi.fn()
const fakeGetSubscription = vi.fn()

beforeEach(() => {
  supabaseRpc.mockReset().mockResolvedValue({ data: 1, error: null })
  fakeSubscribe.mockReset()
  fakeGetSubscription.mockReset()
  globalThis.PushManager = function () {}
  globalThis.navigator = {
    userAgent: 'jsdom',
    serviceWorker: {
      register: vi.fn().mockResolvedValue({
        pushManager: {
          getSubscription: fakeGetSubscription,
          subscribe: fakeSubscribe,
        },
      }),
      getRegistration: vi.fn(),
    },
  }
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  globalThis.self = globalThis
  try {
    globalThis.crypto = globalThis.crypto || { getRandomValues: () => new Uint8Array(0) }
  } catch {
    // crypto is a getter-only property in some environments; skip if already set
  }
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary')
  // Vite import.meta.env is not present in vitest — pushClient reads it via a getter helper.
})

afterEach(() => {
  delete globalThis.Notification
  delete globalThis.PushManager
})

describe('getPushState', () => {
  it('returns "unsupported" without serviceWorker or PushManager', async () => {
    delete globalThis.PushManager
    const { getPushState } = await import('./pushClient.js')
    expect(getPushState()).toBe('unsupported')
  })

  it('returns Notification.permission otherwise', async () => {
    setNotification('default')
    const { getPushState } = await import('./pushClient.js?t=' + Date.now())
    expect(getPushState()).toBe('default')
  })
})

describe('isIosNonStandalone', () => {
  it('detects iPhone Safari without standalone display-mode', async () => {
    globalThis.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)'
    const { isIosNonStandalone } = await import('./pushClient.js?t=' + Date.now())
    expect(isIosNonStandalone()).toBe(true)
  })

  it('returns false in standalone display-mode', async () => {
    globalThis.navigator.userAgent = 'iPhone'
    globalThis.window.matchMedia = () => ({ matches: true })
    const { isIosNonStandalone } = await import('./pushClient.js?t=' + Date.now())
    expect(isIosNonStandalone()).toBe(false)
  })
})

describe('enablePush', () => {
  it('subscribes via pushManager and persists via RPC', async () => {
    setNotification('default')
    fakeGetSubscription.mockResolvedValue(null)
    fakeSubscribe.mockResolvedValue({
      endpoint: 'https://x.test/abc',
      toJSON: () => ({ endpoint: 'https://x.test/abc', keys: { p256dh: 'P', auth: 'A' } }),
    })
    process.env.VITE_VAPID_PUBLIC_KEY = 'BEh...test...key'

    const { enablePush } = await import('./pushClient.js?t=' + Date.now())
    const result = await enablePush()
    expect(result.state).toBe('granted')
    expect(supabaseRpc).toHaveBeenCalledWith('upsert_push_subscription', {
      p_endpoint: 'https://x.test/abc',
      p_p256dh:   'P',
      p_auth:     'A',
      p_user_agent: 'jsdom',
    })
  })

  it('returns state=denied without RPC call when permission denied', async () => {
    setNotification('denied')
    const { enablePush } = await import('./pushClient.js?t=' + Date.now())
    const r = await enablePush()
    expect(r.state).toBe('denied')
    expect(supabaseRpc).not.toHaveBeenCalled()
  })
})

describe('disablePush', () => {
  it('calls RPC and unsubscribes', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue({
          endpoint: 'https://x.test/abc',
          unsubscribe,
        }),
      },
    })

    const { disablePush } = await import('./pushClient.js?t=' + Date.now())
    await disablePush()
    expect(supabaseRpc).toHaveBeenCalledWith('delete_push_subscription', {
      p_endpoint: 'https://x.test/abc',
    })
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('is a no-op when no subscription present', async () => {
    globalThis.navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    })
    const { disablePush } = await import('./pushClient.js?t=' + Date.now())
    await expect(disablePush()).resolves.toBeUndefined()
    expect(supabaseRpc).not.toHaveBeenCalled()
  })
})
