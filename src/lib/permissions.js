export function isSuperadmin(user) {
  return user?.role === 'superadmin'
}

export function hasPermission(user, permission) {
  if (!user) return false
  if (isSuperadmin(user)) return true
  const perms = user.permissions
  if (!Array.isArray(perms)) return false
  return perms.includes(permission)
}

export function hasAnyPermission(user, permissions) {
  if (isSuperadmin(user)) return true
  return permissions.some((p) => hasPermission(user, p))
}

export function hasAllPermissions(user, permissions) {
  if (isSuperadmin(user)) return true
  return permissions.every((p) => hasPermission(user, p))
}
