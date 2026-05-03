// api/push/_render.js
//
// Renders the push payload sent to the Service Worker. Reuses the existing
// in-app notification copy via src/lib/notificationMessages.js so the push
// title/body stay byte-identical to the inbox row text.

import {
  formatNotificationMessage,
  targetForNotification,
} from '../../src/lib/notificationMessages.js'

const DELETION_REQUEST_TARGET = '/admin/agencies'

export function renderPushPayload(eventData, rowId) {
  // eventData shape mirrors get_push_event_data: { source, entity_id, entity_label,
  // actor_id, actor_name, event_type, payload, created_at }.

  const body = formatNotificationMessage(eventData)

  let title
  if (eventData.source === 'deletion_request') {
    title = 'Запрос на удаление'
  } else {
    title = eventData.entity_label || 'Уведомление'
  }

  let url = targetForNotification(eventData)
  if (!url) {
    url = eventData.source === 'deletion_request' ? DELETION_REQUEST_TARGET : '/notifications'
  }

  const tag = `${eventData.source}:${rowId}`

  return { title, body, url, tag }
}
