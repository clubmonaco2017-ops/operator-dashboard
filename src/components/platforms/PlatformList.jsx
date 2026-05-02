import { PlatformListItem } from './PlatformListItem.jsx'

export function PlatformList({ rows, selectedId }) {
  return (
    <ul className="flex flex-col py-1" aria-label="Список платформ">
      {rows.map((p) => (
        <li key={p.id}>
          <PlatformListItem platform={p} isActive={p.id === selectedId} />
        </li>
      ))}
    </ul>
  )
}
