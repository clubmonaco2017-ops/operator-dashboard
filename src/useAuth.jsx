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
    id: row.id,
    email: row.email,
    role: row.role,
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
  signIn: async () => {},
  signOut: async () => {},
  // Legacy aliases
  login: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Initial session + subscribe to auth state changes.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session)
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
  useEffect(() => {
    let cancelled = false
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
        } else {
          setUser(normalizeProfile(data))
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Legacy aliases — consumed by App.jsx (login/logout) until Stage 5+ sweep.
  // login() wraps signIn and returns the { success, error } shape LoginPage expects.
  const login = useCallback(async (email, password) => {
    const { error } = await signIn(email, password)
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  }, [signIn])

  const logout = useCallback(async () => {
    await signOut()
  }, [signOut])

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signOut, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
