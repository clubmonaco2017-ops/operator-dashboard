import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { TasksKpiCard } from './TasksKpiCard.jsx'

function renderCard(props) {
  return render(
    <MemoryRouter>
      <TasksKpiCard
        label="Мои задачи"
        icon={Inbox}
        to="/tasks"
        unread={0}
        overdue={0}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('TasksKpiCard', () => {
  it('renders both stat values with their labels', () => {
    renderCard({ unread: 5, overdue: 2 })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/непрочитанн/i)).toBeInTheDocument()
    expect(screen.getByText(/просрочен/i)).toBeInTheDocument()
  })

  it('uses red accent border when overdue > 0', () => {
    const { container } = renderCard({ unread: 0, overdue: 3 })
    const article = container.querySelector('article')
    expect(article.className).toContain('border-l-red-500')
  })

  it('uses blue accent border when only unread > 0', () => {
    const { container } = renderCard({ unread: 4, overdue: 0 })
    const article = container.querySelector('article')
    expect(article.className).toContain('border-l-blue-500')
    expect(article.className).not.toContain('border-l-red-500')
  })
})
