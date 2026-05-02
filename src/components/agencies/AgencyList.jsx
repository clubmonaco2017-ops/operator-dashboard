import { AgencyListItem } from './AgencyListItem.jsx'

export function AgencyList({ rows, selectedId }) {
  return (
    <ul className="flex flex-col py-1" aria-label="Список агентств">
      {rows.map((a) => (
        <li key={a.id}>
          <AgencyListItem agency={a} isActive={a.id === selectedId} />
        </li>
      ))}
    </ul>
  )
}
