// Шаблоны сообщений для событий из таблицы staff_activity.
// Используются в ActivityTab (вкладка «Активность» в /staff).
//
// События могут касаться viewer'а с двух сторон:
//   - viewer = target (sa.user_id)  — что-то делали с ним
//   - viewer = actor  (sa.actor_id) — он сам что-то делал с другим
// Шаблон один: «{actor} → действие → {target}». Контекст вкладки делает
// очевидным, кто здесь «герой».

const TEMPLATES = {
  user_created: ({ actor, target }) =>
    `${actor} создал${ending(actor)} сотрудника ${target}`,
  curator_assigned: ({ actor, target }) =>
    `${actor} назначил${ending(actor)} куратора для ${target}`,
  curator_changed: ({ actor, target }) =>
    `${actor} сменил${ending(actor)} куратора для ${target}`,
  removed_curatorships_as_moderator: ({ actor, target }) =>
    `${actor} снял${ending(actor)} ${target} как модератора-куратора`,
  removed_curatorships_as_operator: ({ actor, target }) =>
    `${actor} снял${ending(actor)} ${target} как оператора-куратора`,
  removed_team_memberships: ({ actor, target }) =>
    `${actor} убрал${ending(actor)} ${target} из команд`,
  user_archived_with_cascade: ({ actor, target }) =>
    `${actor} архивировал${ending(actor)} ${target}`,
  user_reactivated: ({ actor, target }) =>
    `${actor} восстановил${ending(actor)} ${target}`,
  task_deleted: ({ actor, target, payload }) => {
    const title = payload?.title
    return title
      ? `${actor} удалил${ending(actor)} задачу «${title}» (исполнитель: ${target})`
      : `${actor} удалил${ending(actor)} задачу исполнителя ${target}`
  },
}

function ending(actor) {
  const firstWord = String(actor || '').trim().split(/\s+/)[0] || ''
  const last = firstWord.slice(-1).toLowerCase()
  if (last === 'а' || last === 'я') return 'а'
  return ''
}

export function formatStaffActivityMessage(row) {
  const actor = row.actor_name?.trim() || 'Система'
  const target = row.target_name?.trim() || ''
  const tmpl = TEMPLATES[row.event_type]
  if (tmpl) return tmpl({ actor, target, payload: row.payload || {} })
  return `${actor} выполнил${ending(actor)} действие (${row.event_type})`
}
