// Subplan 5 — helpers для задач: plural-формы, форматтер дедлайна,
// effective_status (mirror RPC), предикаты прав и валидаторы.
// Pure functions, no side-effects.

import { pluralRu } from './clients.js'

/**
 * Форматирует дедлайн относительно `now`:
 *  - null/невалидная дата → '';
 *  - просрочено → 'просрочено N дней';
 *  - сегодня → 'сегодня в HH:mm';
 *  - завтра → 'завтра';
 *  - иначе → 'через N дней'.
 *
 * @param {string|Date|null|undefined} deadline
 * @param {Date} [now]
 * @returns {string}
 */
export function formatDeadlineRelative(deadline, now = new Date()) {
  if (!deadline) return ''
  const d = new Date(deadline)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) {
    const abs = Math.abs(diffDays)
    return `просрочено ${abs} ${pluralRu(abs, { one: 'день', few: 'дня', many: 'дней' })}`
  }
  if (diffDays === 0) {
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `сегодня в ${h}:${m}`
  }
  if (diffDays === 1) return 'завтра'
  return `через ${diffDays} ${pluralRu(diffDays, { one: 'день', few: 'дня', many: 'дней' })}`
}

/**
 * Зеркало RPC computed `effective_status` (см. spec D-7).
 * Если задача просрочена и в активном статусе — overdue, иначе исходный статус.
 *
 * @param {{status:string, deadline:string|null}|null|undefined} task
 * @param {Date} [now]
 * @returns {string|null}
 */
export function computeEffectiveStatus(task, now = new Date()) {
  if (!task) return null
  if (
    task.deadline &&
    new Date(task.deadline) < now &&
    ['pending', 'in_progress'].includes(task.status)
  ) {
    return 'overdue'
  }
  return task.status
}

/**
 * Может ли user редактировать задачу?
 *  - admin/superadmin — всегда;
 *  - автор задачи — да;
 *  - остальные — нет.
 *
 * @param {{id:number, role:string}|null|undefined} user
 * @param {{created_by:number}|null|undefined} task
 * @returns {boolean}
 */
export function canEditTask(user, task) {
  if (!user || !task) return false
  if (['admin', 'superadmin'].includes(user.role)) return true
  return task.created_by === user.id
}

/**
 * Может ли user перевести задачу в работу?
 *  - только assignee;
 *  - только из статуса pending.
 *
 * @param {{id:number}|null|undefined} user
 * @param {{assigned_to:number, status:string}|null|undefined} task
 * @returns {boolean}
 */
export function canTakeInProgress(user, task) {
  if (!user || !task) return false
  return task.assigned_to === user.id && task.status === 'pending'
}

/**
 * Может ли user сдать отчёт по задаче?
 *  - только assignee;
 *  - только из статуса in_progress.
 *
 * @param {{id:number}|null|undefined} user
 * @param {{assigned_to:number, status:string}|null|undefined} task
 * @returns {boolean}
 */
export function canSubmitReport(user, task) {
  if (!user || !task) return false
  return task.assigned_to === user.id && task.status === 'in_progress'
}

/**
 * Может ли user отменить задачу?
 *  - admin/superadmin или автор;
 *  - только из активных статусов (pending|in_progress).
 *
 * @param {{id:number, role:string}|null|undefined} user
 * @param {{created_by:number, status:string}|null|undefined} task
 * @returns {boolean}
 */
export function canCancelTask(user, task) {
  if (!user || !task) return false
  if (!['admin', 'superadmin'].includes(user.role) && task.created_by !== user.id) return false
  return ['pending', 'in_progress'].includes(task.status)
}

/**
 * Может ли user удалить задачу? Только admin/superadmin.
 *
 * @param {{role:string}|null|undefined} user
 * @returns {boolean}
 */
export function canDeleteTask(user) {
  if (!user) return false
  return ['admin', 'superadmin'].includes(user.role)
}

/**
 * Валидация заголовка задачи. Required, max 200 символов.
 *
 * @param {string|null|undefined} value
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateTaskTitle(value) {
  if (value == null || String(value).trim() === '')
    return { valid: false, error: 'Название задачи обязательно' }
  if (String(value).trim().length > 200)
    return { valid: false, error: 'Слишком длинное название (макс 200 симв.)' }
  return { valid: true }
}

/**
 * Валидация отчёта: должен быть либо текст, либо хотя бы один файл.
 *
 * @param {string|null|undefined} content
 * @param {Array|null|undefined} media
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateReport(content, media) {
  const hasContent = content != null && String(content).trim().length > 0
  const hasMedia = Array.isArray(media) && media.length > 0
  if (!hasContent && !hasMedia)
    return { valid: false, error: 'Отчёт должен содержать описание или хотя бы один файл' }
  return { valid: true }
}
