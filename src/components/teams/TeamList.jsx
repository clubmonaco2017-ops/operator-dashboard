import { TeamListItem } from './TeamListItem.jsx'

/**
 * Master-список команд. Не управляет фильтрами / поиском — просто рендерит.
 *
 * @param {object} props
 * @param {Array} props.rows — массив команд (отфильтрованный snapshot list_teams)
 * @param {number|null} props.selectedId — id выбранной команды
 * @param {object|null} props.user — текущий пользователь (для canEditTeam → бейдж «Только просмотр»)
 */
export function TeamList({ rows, selectedId, user }) {
  return (
    <ul className="flex flex-col py-1">
      {rows.map((team) => (
        <li key={team.id}>
          <TeamListItem
            team={team}
            isActive={team.id === selectedId}
            user={user}
          />
        </li>
      ))}
    </ul>
  )
}
