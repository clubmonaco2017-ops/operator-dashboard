import { Section, SubSection } from './Section.jsx'
import { TASK_CARDS, renderCards } from './cardRegistry.jsx'

export function SectionTasks({ user }) {
  const rendered = renderCards(TASK_CARDS, user, { user })
  if (rendered.length === 0) return null
  return (
    <Section id="tasks" title="Задачи">
      <SubSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{rendered}</div>
      </SubSection>
    </Section>
  )
}
