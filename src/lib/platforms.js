import { adminFetch } from './adminFetch.js'

/**
 * Тонкая обёртка над REST endpoint /api/admin/platforms.
 * Action-based pattern: list/create/update/delete.
 *
 * Returns { data, error } per adminFetch contract.
 */
export function platformApi(action, params = {}) {
  return adminFetch('/api/admin/platforms', { action, ...params })
}
