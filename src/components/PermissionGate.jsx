import { hasPermission, hasAnyPermission } from '../lib/permissions.js'

/**
 * Conditionally renders children based on user permissions.
 *
 * Usage:
 *   <PermissionGate user={user} permission="create_tasks">...</PermissionGate>
 *   <PermissionGate user={user} anyOf={['view_all_tasks', 'view_own_tasks']}>...</PermissionGate>
 *   <PermissionGate user={user} permission="manage_roles" fallback={<span>No access</span>}>...</PermissionGate>
 *
 * Superadmins always pass.
 */
export function PermissionGate({
  user,
  permission,
  anyOf,
  fallback = null,
  children,
}) {
  let allowed = false
  if (permission) {
    allowed = hasPermission(user, permission)
  } else if (Array.isArray(anyOf)) {
    allowed = hasAnyPermission(user, anyOf)
  }
  return allowed ? <>{children}</> : fallback
}
