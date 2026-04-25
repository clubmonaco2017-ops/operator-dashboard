import { useEffect, useState } from 'react'
import { ClientListItem } from './ClientListItem.jsx'

/**
 * Master-список клиентов. Не управляет фильтрами / поиском — просто рендерит.
 *
 * @param {object} props
 * @param {Array} props.rows — массив клиентов (отфильтрованный snapshot)
 * @param {string|number|null} props.selectedId — id выбранного клиента
 * @param {boolean} props.loading
 * @param {string|null} props.error
 */
export function ClientList({ rows, selectedId, loading, error }) {
  if (loading) {
    return <ListSkeletonWithSlowHint />
  }
  if (error) {
    return (
      <div className="px-4 py-6 text-sm text-[var(--danger-ink)]" role="alert">
        Ошибка: {error}
      </div>
    )
  }
  if (rows.length === 0) {
    // Caller отвечает за empty-card — здесь возвращаем null, чтобы не дублировать
    return null
  }

  const sel = selectedId == null ? null : Number(selectedId)
  return (
    <ul className="flex flex-col py-1">
      {rows.map((client) => (
        <li key={client.id}>
          <ClientListItem client={client} isActive={sel === client.id} />
        </li>
      ))}
    </ul>
  )
}

function ListSkeletonWithSlowHint() {
  // 8.C: после 2 сек показываем «Загружается …» — даём пользователю понять,
  // что система не зависла.
  const slow = useSlowFlag(2000)
  return (
    <>
      {slow && (
        <p
          className="px-5 pt-3 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Загружается список клиентов…
        </p>
      )}
      <ListSkeleton />
    </>
  )
}

function useSlowFlag(thresholdMs) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), thresholdMs)
    return () => clearTimeout(t)
  }, [thresholdMs])
  return slow
}

function ListSkeleton() {
  // 8.B: structure mirrors real ClientListItem (round avatar + 2 lines + counter)
  // so layout не прыгает при появлении контента.
  // Detereministic widths — без рандомных rerender'ов.
  const widths = [62, 48, 70, 55, 50, 65, 45]
  return (
    <ul className="flex flex-col py-1" aria-label="Загрузка списка" aria-busy="true">
      {widths.map((w, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-l-2 border-l-transparent px-4 py-2.5"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${w}%` }}
            />
            <div
              className="h-2.5 animate-pulse rounded bg-muted/70"
              style={{ width: `${Math.max(28, w - 22)}%` }}
            />
          </div>
          <div className="h-3 w-5 shrink-0 animate-pulse rounded bg-muted/70" />
        </li>
      ))}
    </ul>
  )
}
