// Subplan 4 — helpers для команд: plural-формы, форматтеры, валидаторы
// и предикаты прав. Все функции — pure, без side-effects.

import { pluralRu } from './clients.js'

export const pluralizeOperators = (n) =>
  `${n} ${pluralRu(n, { one: 'оператор', few: 'оператора', many: 'операторов' })}`

/**
 * Форматирует роль лида команды для отображения.
 * @param {string|null|undefined} role
 * @returns {string}
 */
export function formatLeadRole(role) {
  if (role === 'teamlead') return 'Тимлид'
  if (role === 'moderator') return 'Модератор'
  return role ?? ''
}

/**
 * Валидация имени команды. Required, max 80 символов.
 * @param {string|null|undefined} value
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateTeamName(value) {
  if (value == null || String(value).trim() === '')
    return { valid: false, error: 'Имя команды обязательно' }
  if (String(value).trim().length > 80)
    return { valid: false, error: 'Слишком длинное имя (макс 80 симв.)' }
  return { valid: true }
}

/**
 * Может ли user редактировать команду?
 *  - admin/superadmin — всегда;
 *  - lead команды (teamlead/moderator) — да;
 *  - остальные — нет.
 * @param {{id:number, role:string}|null|undefined} user
 * @param {{lead_user_id:number}|null|undefined} team
 * @returns {boolean}
 */
export function canEditTeam(user, team) {
  if (!user || !team) return false
  if (user.role === 'admin' || user.role === 'superadmin') return true
  return team.lead_user_id === user.id
}

/**
 * Может ли user управлять кураторством оператора?
 *  - admin/superadmin — всегда;
 *  - текущий куратор оператора — да (передаёт другому);
 *  - новый куратор — да (берёт себе).
 * @param {{id:number, role:string}|null|undefined} user
 * @param {number|null} currentCuratorId
 * @param {number|null} newModeratorId
 * @returns {boolean}
 */
export function canManageCuratorship(user, currentCuratorId, newModeratorId) {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'superadmin') return true
  if (user.id === currentCuratorId) return true
  if (user.id === newModeratorId) return true
  return false
}

/**
 * Видит ли user пункт «Команды» в Sidebar?
 *  - admin/superadmin/teamlead/moderator — всегда;
 *  - operator — только если состоит в команде.
 * @param {{id:number, role:string}|null|undefined} user
 * @param {boolean} hasTeamMembership
 * @returns {boolean}
 */
export function canSeeTeamsNav(user, hasTeamMembership) {
  if (!user) return false
  if (['admin', 'superadmin', 'teamlead', 'moderator'].includes(user.role)) return true
  if (user.role === 'operator' && hasTeamMembership) return true
  return false
}
