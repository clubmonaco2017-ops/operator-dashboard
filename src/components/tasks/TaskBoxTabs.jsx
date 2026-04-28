import { useNavigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
    <Tabs
      value={box}
      onValueChange={(next) => {
        const target = tabs.find((t) => t.key === next)
        if (target) navigate(target.path)
      }}
      aria-label="Тип задач"
    >
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
