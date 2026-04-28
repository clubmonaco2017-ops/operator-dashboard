import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

/**
 * Map the get_current_user_profile RPC row (snake_case) into the camelCase
 * shape the rest of the app consumes.  Exported for unit tests.
 */
export function normalizeProfile(row) {
  if (!row) return null

  const permissions = Array.isArray(row.permissions) ? row.permissions : []

  const attributes =
    row.attributes && typeof row.attributes === 'object' ? row.attributes : {}

  return {
    id: row.id ?? null,
    email: row.email ?? null,
    role: row.role ?? null,
    refCode: row.ref_code ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    alias: row.alias ?? null,
    permissions,
    attributes,
    timezone: row.timezone || 'Europe/Kiev',
    isActive: row.is_active !== false,
  }
}

const AuthContext = createContext({
  session: null,
  user: null,
  loading: true,
  authError: null,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Fix 1: surface RPC failures instead of silently looping the user through login
  const [authError, setAuthError] = useState(null)
  // Fix 2: track whether getSession() has resolved at least once
  const [initialized, setInitialized] = useState(false)

  // Initial session + subscribe to auth state changes.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        // Fix 2: only after getSession resolves do we know the true initial state
        setInitialized(true)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Hydrate dashboard_users profile on every session change.
  // Fix 2: gate on `initialized` so loading stays true until getSession() settles
  useEffect(() => {
    let cancelled = false
    if (!initialized) return          // wait for getSession to settle
    if (!session) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
      .rpc('get_current_user_profile')
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('get_current_user_profile failed', error)
          setUser(null)
          // Fix 1: surface the failure so App.jsx can show an error state
          // instead of sending the user back to login (causing an infinite loop)
          setAuthError('profile_load_failed')
        } else {
          setUser(normalizeProfile(data))
          // Fix 1: clear any previous error on successful hydration
          setAuthError(null)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session, initialized])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    // Fix 1: clear authError on deliberate logout so a re-login starts clean
    setAuthError(null)
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider value={{ session, user, loading, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
