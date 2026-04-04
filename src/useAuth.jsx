import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const SESSION_KEY = 'auth_session'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
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

      const row = data[0]
      const session = {
        id: row.user_id,
        email: row.user_email,
        role: row.user_role,
        permissions: row.user_permissions || {},
        timezone: row.user_timezone || 'Europe/Kiev',
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
