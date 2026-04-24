const DEFAULTS = {
  admin: [
    'create_tasks',
    'manage_teams',
    'send_reminders',
    'view_all_revenue',
    'view_all_tasks',
  ],
  moderator: [
    'create_tasks',
    'view_own_tasks',
    'view_team_revenue',
  ],
  teamlead: [
    'create_tasks',
    'manage_teams',
    'view_own_tasks',
    'view_team_revenue',
  ],
  operator: [
    'view_own_revenue',
    'view_own_tasks',
  ],
}

export function defaultPermissions(role) {
  return DEFAULTS[role] ?? []
}
