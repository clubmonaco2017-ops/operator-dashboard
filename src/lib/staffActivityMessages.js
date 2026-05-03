// Шаблоны сообщений для событий из таблицы staff_activity.
// Используются в ActivityTab (вкладка «Активность» в /staff).

const TEMPLATES = {
  curator_assigned:                 ({ actor }) => `${actor} назначил${ending(actor)} куратора`,
  curator_changed:                  ({ actor }) => `${actor} сменил${ending(actor)} куратора`,
  removed_curatorships_as_moderator:({ actor }) => `${actor} снял${ending(actor)} как модератор-куратор`,
  removed_curatorships_as_operator: ({ actor }) => `${actor} снял${ending(actor)} как куратора`,
  removed_team_memberships:         ({ actor }) => `${actor} убрал${ending(actor)} из команд`,
  user_archived_with_cascade:       ({ actor }) => `${actor} архивировал${ending(actor)} сотрудника`,
  user_reactivated:                 ({ actor }) => `${actor} восстановил${ending(actor)} сотрудника`,
  task_deleted: ({ actor, payload }) => {
    const title = payload?.title
    return title
      ? `${actor} удалил${ending(actor)} задачу «${title}»`
      : `${actor} удалил${ending(actor)} задачу`
  },
}

function ending(actor) {
  if (actor === 'Система') return 'а'
  return ''
}

export function formatStaffActivityMessage(row) {
  const actor = row.actor_name?.trim() || 'Система'
  const tmpl = TEMPLATES[row.event_type]
  if (tmpl) return tmpl({ actor, payload: row.payload || {} })
  return `${actor} выполнил${ending(actor)} действие (${row.event_type})`
}
