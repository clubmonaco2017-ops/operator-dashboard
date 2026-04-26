import { TaskListItem } from './TaskListItem.jsx'

/**
 * Master-список задач. Не управляет фильтрами / поиском — просто рендерит.
 *
 * @param {object} props
 * @param {Array} props.rows — массив задач (snapshot list_tasks)
 * @param {number|null} props.selectedId
 * @param {string} props.basePath — '/tasks' | '/tasks/outbox' | '/tasks/all'
 */
export function TaskList({ rows, selectedId, basePath }) {
  return (
    <ul className="flex flex-col py-1">
      {rows.map((task) => (
        <li key={task.id}>
          <TaskListItem
            task={task}
            isActive={task.id === selectedId}
            basePath={basePath}
          />
        </li>
      ))}
    </ul>
  )
}
