import { useMemo } from 'react'

/**
 * Lookup-функция: ищет платформу по id среди уже загруженных rows.
 * Не делает отдельный fetch — REST endpoint не имеет get_one action.
 * После save tabs вызывают reload parent'а → fresh rows → fresh lookup.
 */
export function usePlatformDetail(rows, platformId) {
  return useMemo(() => {
    if (!platformId) return null
    return rows.find((r) => r.id === platformId) ?? null
  }, [rows, platformId])
}
