import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListPane } from './ListPane.jsx'

describe('<ListPane>', () => {
  it('renders all four optional slots when provided', () => {
    render(
      <ListPane
        title="Клиенты 24"
        search={<input data-testid="search" />}
        filters={<div data-testid="chips">chips</div>}
        createButton={<button data-testid="create">+ Новый</button>}
      >
        <ul data-testid="list"><li>row 1</li></ul>
      </ListPane>,
    )
    expect(screen.getByText('Клиенты 24')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toBeInTheDocument()
    expect(screen.getByTestId('chips')).toBeInTheDocument()
    expect(screen.getByTestId('create')).toBeInTheDocument()
    expect(screen.getByTestId('list')).toHaveTextContent('row 1')
  })

  it('renders only children when other slots are omitted', () => {
    const { container } = render(
      <ListPane>
        <ul data-testid="list"><li>row</li></ul>
      </ListPane>,
    )
    expect(screen.getByTestId('list')).toBeInTheDocument()
    expect(container.querySelectorAll('div.border-b').length).toBe(0)
  })

  it('renders title alone (no createButton) without errors', () => {
    render(
      <ListPane title="Только заголовок">
        <div>list</div>
      </ListPane>,
    )
    expect(screen.getByText('Только заголовок')).toBeInTheDocument()
  })
})
