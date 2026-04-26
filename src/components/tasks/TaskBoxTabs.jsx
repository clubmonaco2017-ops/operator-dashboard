import { useNavigate } from 'react-router-dom'

/**
 * Box-табы master-панели задач: Входящие / Исходящие / Все.
 * «Все» виден только при наличии view_all_tasks.
 *
 * @param {object} props
 * @param {'inbox'|'outbox'|'all'} props.box
 * @param {boolean} props.hasViewAll
 */
export function TaskBoxTabs({ box, hasViewAll }) {
  const navigate = useNavigate()
  const tabs = [
    { key: 'inbox', label: 'Входящие', path: '/tasks' },
    { key: 'outbox', label: 'Исходящие', path: '/tasks/outbox' },
  ]
  if (hasViewAll) tabs.push({ key: 'all', label: 'Все', path: '/tasks/all' })

  return (
    <div
      role="tablist"
      aria-label="Тип задач"
      className="flex items-center gap-1"
    >
      {tabs.map((tab) => {
        const active = box === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => navigate(tab.path)}
            className={[
              '-mb-px px-3 py-2 text-sm transition-colors outline-none focus-ds',
              active
                ? 'border-b-2 border-primary text-foreground font-semibold'
                : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
