import { StaffListItem } from './StaffListItem.jsx'

/**
 * Master-список сотрудников. Не управляет фильтрами / поиском — просто рендерит.
 *
 * @param {object} props
 * @param {Array} props.rows — отфильтрованный массив сотрудников
 * @param {string|null} props.selectedRefCode — ref_code выбранного сотрудника
 */
export function StaffList({ rows, selectedRefCode }) {
  return (
    <ul className="flex flex-col py-1">
      {rows.map((row) => (
        <li key={row.id}>
          <StaffListItem row={row} isActive={row.ref_code === selectedRefCode} />
        </li>
      ))}
    </ul>
  )
}
