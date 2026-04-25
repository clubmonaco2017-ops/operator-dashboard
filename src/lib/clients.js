// Subplan 3 — helpers для клиентов: plural-формы, валидаторы, форматтеры.
// Все функции — pure, без side-effects.

/**
 * Russian plural form. Возвращает one/few/many в зависимости от числа.
 * @param {number} n
 * @param {{one: string, few: string, many: string}} forms
 * @returns {string}
 */
export function pluralRu(n, forms) {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod10 === 1 && mod100 !== 11) return forms.one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few
  return forms.many
}

export const pluralizeClients = (n) =>
  `${n} ${pluralRu(n, { one: 'клиент', few: 'клиента', many: 'клиентов' })}`

export const pluralizeFiles = (n) =>
  `${n} ${pluralRu(n, { one: 'файл', few: 'файла', many: 'файлов' })}`

// Фото и видео — несклоняемые в русском
export const pluralizePhotos = (n) => `${n} фото`
export const pluralizeVideos = (n) => `${n} видео`

export const pluralizeEvents = (n) =>
  `${n} ${pluralRu(n, { one: 'событие', few: 'события', many: 'событий' })}`

/**
 * Форматирует размер файла. 412KB → "412 КБ", 1.2MB → "1.2 МБ".
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes == null || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`
  }
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} ГБ`
}

/**
 * Форматирует длительность видео.
 *   42_000 → "00:42"
 *   65_000 → "01:05"
 *   3_932_000 → "1:05:32"
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return ''
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

/**
 * Валидация Tableau ID. Опциональное поле, формат TBL-NNNN (4 цифры).
 * @param {string|null|undefined} value
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateTableauId(value) {
  if (value == null || value === '') return { valid: true }
  const trimmed = String(value).trim()
  if (trimmed === '') return { valid: true }
  if (!/^TBL-\d{4,}$/i.test(trimmed)) {
    return { valid: false, error: 'Формат: TBL-NNNN (например, TBL-2351).' }
  }
  return { valid: true }
}

/**
 * Валидация alias. Опционально, должен начинаться с @, не содержать пробелов.
 * @param {string|null|undefined} value
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateAlias(value) {
  if (value == null || value === '') return { valid: true }
  const trimmed = String(value).trim()
  if (trimmed === '') return { valid: true }
  if (!trimmed.startsWith('@')) {
    return { valid: false, error: 'Должен начинаться с @' }
  }
  if (/\s/.test(trimmed)) {
    return { valid: false, error: 'Без пробелов' }
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Минимум 2 символа' }
  }
  return { valid: true }
}

/**
 * Валидация name (имя клиента). Required, минимум 1 непустой символ.
 */
export function validateName(value) {
  if (value == null) return { valid: false, error: 'Имя обязательно' }
  const trimmed = String(value).trim()
  if (trimmed === '') return { valid: false, error: 'Имя обязательно' }
  if (trimmed.length > 120) return { valid: false, error: 'Слишком длинное имя (макс 120 симв.)' }
  return { valid: true }
}

/**
 * Инициалы для avatar fallback. "Sofia Reign" → "SR".
 */
export function initials(name) {
  if (!name) return ''
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Лимиты по типам файлов. См. _decisions.md (Q-6 default).
 */
export const FILE_LIMITS = Object.freeze({
  avatar: { maxBytes: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  photo:  { maxBytes: 25 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  video:  { maxBytes: 500 * 1024 * 1024, mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'] },
})

/**
 * Проверка файла перед загрузкой.
 * @param {File} file
 * @param {'avatar'|'photo'|'video'} kind
 * @returns {{valid: true} | {valid: false, error: string, code: 'size'|'mime'}}
 */
export function validateFile(file, kind) {
  const limit = FILE_LIMITS[kind]
  if (!limit) return { valid: false, error: `Unknown kind: ${kind}`, code: 'mime' }
  if (file.size > limit.maxBytes) {
    return {
      valid: false,
      code: 'size',
      error: `Размер: ${formatFileSize(file.size)} (лимит ${formatFileSize(limit.maxBytes)})`,
    }
  }
  if (!limit.mimeTypes.includes(file.type)) {
    return {
      valid: false,
      code: 'mime',
      error: `Формат: ${file.type || 'неизвестный'} → нужен ${limit.mimeTypes.join(', ')}`,
    }
  }
  return { valid: true }
}
