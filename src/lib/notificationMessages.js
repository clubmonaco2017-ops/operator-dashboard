const TASK_TEMPLATES = {
  task_created:      ({ actor, label }) => `${actor} создал${ending(actor)} задачу «${label}»`,
  task_reassigned:   ({ actor, label }) => `${actor} переназначил${ending(actor)} задачу «${label}»`,
  task_updated:      ({ actor, label }) => `${actor} изменил${ending(actor)} задачу «${label}»`,
  task_cancelled:    ({ actor, label }) => `${actor} отменил${ending(actor)} задачу «${label}»`,
  task_deleted:      ({ actor, label }) => `${actor} удалил${ending(actor)} задачу «${label}»`,
  deadline_changed:  ({ actor, label }) => `${actor} изменил${ending(actor)} дедлайн в задаче «${label}»`,
}

const TEAM_TEMPLATES = {
  team_created:      ({ actor, label }) => `${actor} создал${ending(actor)} команду «${label}»`,
  team_renamed:      ({ actor, label }) => `${actor} переименовал${ending(actor)} команду в «${label}»`,
  team_archived:     ({ actor, label }) => `${actor} архивировал${ending(actor)} команду «${label}»`,
  team_restored:     ({ actor, label }) => `${actor} восстановил${ending(actor)} команду «${label}»`,
  member_added:      ({ actor, label }) => `${actor} добавил${ending(actor)} участника в команду «${label}»`,
  member_removed:    ({ actor, label }) => `${actor} убрал${ending(actor)} участника из команды «${label}»`,
  member_moved:      ({ actor, label }) => `${actor} переместил${ending(actor)} участника в команде «${label}»`,
  client_moved:      ({ actor, label }) => `${actor} переместил${ending(actor)} клиента в команде «${label}»`,
  client_unassigned: ({ actor, label }) => `${actor} открепил${ending(actor)} клиента в команде «${label}»`,
}

function ending(actor) {
  // Heuristic: female if the first word ends with 'а' or 'я' (covers
  // 'Система', 'Анна', 'Анна Смирнова', 'Бекетова', etc).
  // Last name is irrelevant — gender is determined by first name.
  const firstWord = String(actor || '').trim().split(/\s+/)[0] || ''
  const last = firstWord.slice(-1).toLowerCase()
  if (last === 'а' || last === 'я') return 'а'
  return ''
}

export function formatNotificationMessage(n) {
  const actor = n.actor_name?.trim() || 'Система'
  const label = n.entity_label || ''

  if (n.source === 'deletion_request') {
    return `Запрос на удаление: ${label}`
  }

  const templates = n.source === 'task_activity' ? TASK_TEMPLATES
                  : n.source === 'team_activity' ? TEAM_TEMPLATES
                  : null
  const tmpl = templates?.[n.event_type]
  if (tmpl) return tmpl({ actor, label })

  return `${actor} выполнил${ending(actor)} действие в «${label}»`
}

export function targetForNotification(n) {
  switch (n.source) {
    case 'task_activity': return `/tasks?id=${n.entity_id}`
    case 'team_activity': return `/teams?id=${n.entity_id}`
    case 'deletion_request': return null
    default: return null
  }
}
