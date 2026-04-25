import { describe, it, expect } from 'vitest'
import {
  pluralRu,
  pluralizeClients,
  pluralizeFiles,
  pluralizePhotos,
  pluralizeVideos,
  pluralizeEvents,
  formatFileSize,
  formatDuration,
  validateTableauId,
  validateAlias,
  validateName,
  initials,
  validateFile,
  FILE_LIMITS,
} from './clients.js'

describe('pluralRu', () => {
  const forms = { one: 'клиент', few: 'клиента', many: 'клиентов' }

  it('one for 1, 21, 101', () => {
    expect(pluralRu(1, forms)).toBe('клиент')
    expect(pluralRu(21, forms)).toBe('клиент')
    expect(pluralRu(101, forms)).toBe('клиент')
  })

  it('few for 2-4, 22-24, 102-104', () => {
    expect(pluralRu(2, forms)).toBe('клиента')
    expect(pluralRu(3, forms)).toBe('клиента')
    expect(pluralRu(4, forms)).toBe('клиента')
    expect(pluralRu(22, forms)).toBe('клиента')
    expect(pluralRu(103, forms)).toBe('клиента')
  })

  it('many for 5-20, 25-30, 0', () => {
    expect(pluralRu(0, forms)).toBe('клиентов')
    expect(pluralRu(5, forms)).toBe('клиентов')
    expect(pluralRu(11, forms)).toBe('клиентов')
    expect(pluralRu(12, forms)).toBe('клиентов')
    expect(pluralRu(13, forms)).toBe('клиентов')
    expect(pluralRu(14, forms)).toBe('клиентов')
    expect(pluralRu(20, forms)).toBe('клиентов')
    expect(pluralRu(25, forms)).toBe('клиентов')
  })
})

describe('pluralize helpers', () => {
  it('pluralizeClients', () => {
    expect(pluralizeClients(1)).toBe('1 клиент')
    expect(pluralizeClients(3)).toBe('3 клиента')
    expect(pluralizeClients(9)).toBe('9 клиентов')
  })
  it('pluralizeFiles', () => {
    expect(pluralizeFiles(1)).toBe('1 файл')
    expect(pluralizeFiles(2)).toBe('2 файла')
    expect(pluralizeFiles(142)).toBe('142 файла')
    expect(pluralizeFiles(5)).toBe('5 файлов')
  })
  it('pluralizePhotos / pluralizeVideos — без склонения', () => {
    expect(pluralizePhotos(1)).toBe('1 фото')
    expect(pluralizePhotos(118)).toBe('118 фото')
    expect(pluralizeVideos(24)).toBe('24 видео')
  })
  it('pluralizeEvents', () => {
    expect(pluralizeEvents(1)).toBe('1 событие')
    expect(pluralizeEvents(3)).toBe('3 события')
    expect(pluralizeEvents(12)).toBe('12 событий')
  })
})

describe('formatFileSize', () => {
  it('bytes', () => {
    expect(formatFileSize(0)).toBe('0 Б')
    expect(formatFileSize(512)).toBe('512 Б')
  })
  it('KB', () => {
    expect(formatFileSize(1024)).toBe('1 КБ')
    expect(formatFileSize(412 * 1024)).toBe('412 КБ')
  })
  it('MB with decimal under 10', () => {
    expect(formatFileSize(1.2 * 1024 * 1024)).toBe('1.2 МБ')
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe('2.4 МБ')
  })
  it('MB rounded above 10', () => {
    expect(formatFileSize(86 * 1024 * 1024)).toBe('86 МБ')
    expect(formatFileSize(612 * 1024 * 1024)).toBe('612 МБ')
  })
  it('handles null/negative', () => {
    expect(formatFileSize(null)).toBe('')
    expect(formatFileSize(-1)).toBe('')
  })
})

describe('formatDuration', () => {
  it('seconds only', () => {
    expect(formatDuration(42_000)).toBe('00:42')
    expect(formatDuration(7_000)).toBe('00:07')
  })
  it('minutes:seconds', () => {
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(134_000)).toBe('02:14')
  })
  it('hours:minutes:seconds', () => {
    expect(formatDuration(3_932_000)).toBe('1:05:32')
    expect(formatDuration(3_600_000)).toBe('1:00:00')
  })
  it('handles null/negative', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(-1)).toBe('')
  })
})

describe('validateTableauId', () => {
  it('valid: TBL- followed by digits', () => {
    expect(validateTableauId('TBL-2351')).toEqual({ valid: true })
    expect(validateTableauId('TBL-9999')).toEqual({ valid: true })
    expect(validateTableauId('tbl-1234')).toEqual({ valid: true }) // case-insensitive
    expect(validateTableauId('TBL-12345')).toEqual({ valid: true }) // 5+ digits OK
  })
  it('valid: empty/null (optional field)', () => {
    expect(validateTableauId('')).toEqual({ valid: true })
    expect(validateTableauId(null)).toEqual({ valid: true })
    expect(validateTableauId(undefined)).toEqual({ valid: true })
    expect(validateTableauId('   ')).toEqual({ valid: true })
  })
  it('invalid: wrong format', () => {
    expect(validateTableauId('TBL').valid).toBe(false)
    expect(validateTableauId('2351').valid).toBe(false)
    expect(validateTableauId('TBL-abc').valid).toBe(false)
    expect(validateTableauId('TBL-12').valid).toBe(false) // только 2 digits
  })
})

describe('validateAlias', () => {
  it('valid', () => {
    expect(validateAlias('@sofia.reign')).toEqual({ valid: true })
    expect(validateAlias('@miavoss')).toEqual({ valid: true })
    expect(validateAlias('')).toEqual({ valid: true })
    expect(validateAlias(null)).toEqual({ valid: true })
  })
  it('invalid: no @', () => {
    expect(validateAlias('sofia').valid).toBe(false)
    expect(validateAlias('sofia.reign').valid).toBe(false)
  })
  it('invalid: spaces', () => {
    expect(validateAlias('@sofia reign').valid).toBe(false)
  })
  it('invalid: too short', () => {
    expect(validateAlias('@').valid).toBe(false)
  })
})

describe('validateName', () => {
  it('valid', () => {
    expect(validateName('Sofia Reign')).toEqual({ valid: true })
    expect(validateName('A')).toEqual({ valid: true })
  })
  it('invalid: empty', () => {
    expect(validateName('').valid).toBe(false)
    expect(validateName('   ').valid).toBe(false)
    expect(validateName(null).valid).toBe(false)
    expect(validateName(undefined).valid).toBe(false)
  })
  it('invalid: too long', () => {
    expect(validateName('A'.repeat(121)).valid).toBe(false)
  })
})

describe('initials', () => {
  it('two-word name', () => {
    expect(initials('Sofia Reign')).toBe('SR')
    expect(initials('Mia Voss')).toBe('MV')
  })
  it('single name', () => {
    expect(initials('Sofia')).toBe('SO')
  })
  it('three-word name uses first and last', () => {
    expect(initials('Anna Maria Smith')).toBe('AS')
  })
  it('empty', () => {
    expect(initials('')).toBe('')
    expect(initials(null)).toBe('')
  })
})

describe('validateFile', () => {
  const makeFile = (size, type) => ({ size, type, name: 'x' })

  it('valid photo', () => {
    expect(validateFile(makeFile(1024 * 1024, 'image/jpeg'), 'photo')).toEqual({ valid: true })
  })
  it('rejects oversize photo', () => {
    const result = validateFile(makeFile(30 * 1024 * 1024, 'image/jpeg'), 'photo')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('size')
    expect(result.error).toMatch(/30 МБ/)
    expect(result.error).toMatch(/25 МБ/)
  })
  it('rejects wrong mime', () => {
    const result = validateFile(makeFile(1024, 'image/heic'), 'photo')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('mime')
  })
  it('valid video up to 500 МБ', () => {
    expect(validateFile(makeFile(500 * 1024 * 1024 - 1, 'video/mp4'), 'video')).toEqual({ valid: true })
  })
  it('rejects oversize video', () => {
    const result = validateFile(makeFile(612 * 1024 * 1024, 'video/quicktime'), 'video')
    expect(result.valid).toBe(false)
    expect(result.code).toBe('size')
  })
})

describe('FILE_LIMITS', () => {
  it('matches Q-6 defaults', () => {
    expect(FILE_LIMITS.avatar.maxBytes).toBe(5 * 1024 * 1024)
    expect(FILE_LIMITS.photo.maxBytes).toBe(25 * 1024 * 1024)
    expect(FILE_LIMITS.video.maxBytes).toBe(500 * 1024 * 1024)
  })
  it('is frozen', () => {
    expect(Object.isFrozen(FILE_LIMITS)).toBe(true)
  })
})
