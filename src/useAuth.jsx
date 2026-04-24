import { useState } from 'react'
import { supabase } from './supabaseClient'

const SESSION_KEY = 'auth_session'

/**
 * Convert an auth_login RPC row into our internal session shape.
 * Exported for unit tests.
 */
export function normalizeSession(row) {
  if (!row) return null

  // Prefer new text[] field; fall back to legacy jsonb object with boolean flags.
  let permissions = []
  if (Array.isArray(row.user_permission_names)) {
    permissions = row.user_permission_names
  } else if (Array.isArray(row.user_permissions)) {
    permissions = row.user_permissions
  } else if (row.user_permissions && typeof row.user_permissions === 'object') {
    permissions = Object.entries(row.user_permissions)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k)
  }

  const attributes =
    row.user_attributes && typeof row.user_attributes === 'object'
      ? row.user_attributes
      : {}

  return {
    id: row.user_id,
    email: row.user_email,
    role: row.user_role,
    refCode: row.user_ref_code ?? null,
    firstName: row.user_first_name ?? null,
    lastName: row.user_last_name ?? null,
    alias: row.user_alias ?? null,
    permissions,
    attributes,
    timezone: row.user_timezone || 'Europe/Kiev',
    isActive: row.user_is_active !== false,
  }
}

// Detect a session stored with the legacy shape (permissions as an object).
// Returning null causes the app to show the login screen; user re-logs in
// and gets a normalized session.
function loadStoredSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed && parsed.permissions && !Array.isArray(parsed.permissions)) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function useAuth() {
  const [user, setUser] = useState(loadStoredSession)
  const [loading, setLoading] = useState(false)

  const login = async (email, password) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('auth_login', {
        p_email: email,
        p_password: password,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (!data || data.length === 0) {
        return { success: false, error: 'Неверный email или пароль' }
      }

      const session = normalizeSession(data[0])
      if (!session) {
        return { success: false, error: 'Ошибка авторизации: пустой ответ сервера' }
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      setUser(session)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message || 'Ошибка авторизации' }
    } finally {
      setLoading(false)
    }
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  const updateTimezone = async (tz) => {
    if (!user) return
    await supabase.rpc('update_user_timezone', { p_user_id: user.id, p_timezone: tz })
    const updated = { ...user, timezone: tz }
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    setUser(updated)
  }

  return { user, login, logout, loading, updateTimezone }
}
