export const permissionGroups = [
  {
    title: 'Администрирование',
    permissions: [
      { key: 'create_users', label: 'Создавать сотрудников' },
      { key: 'manage_roles', label: 'Управлять ролями и правами' },
      { key: 'manage_teams', label: 'Управлять командами' },
      { key: 'send_reminders', label: 'Отправлять напоминания' },
    ],
  },
  {
    title: 'Клиенты',
    permissions: [
      { key: 'manage_clients',      label: 'CRUD клиентов' },
      { key: 'assign_team_clients', label: 'Назначать клиентов на команду' },
    ],
  },
  {
    title: 'Задачи',
    permissions: [
      { key: 'create_tasks',   label: 'Создавать задачи' },
      { key: 'view_all_tasks', label: 'Видеть все задачи' },
      { key: 'view_own_tasks', label: 'Видеть свои задачи' },
    ],
  },
  {
    title: 'Просмотр выручки',
    permissions: [
      { key: 'view_all_revenue',  label: 'Вся выручка' },
      { key: 'view_team_revenue', label: 'Выручка команды / смены' },
      { key: 'view_own_revenue',  label: 'Своя выручка' },
    ],
  },
  {
    title: 'Прочее',
    permissions: [
      { key: 'use_chat', label: 'Внутренний чат' },
    ],
  },
]

export function allKnownPermissions() {
  return permissionGroups.flatMap((g) => g.permissions.map((p) => p.key))
}
