import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MasterDetailLayout } from './MasterDetailLayout.jsx'

describe('<MasterDetailLayout>', () => {
  it('renders listPane in left aside and children in main section', () => {
    render(
      <MasterDetailLayout listPane={<div data-testid="lp">List Content</div>}>
        <div data-testid="main">Main Content</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List Content')
    expect(screen.getByTestId('main')).toHaveTextContent('Main Content')
  })

  it('uses fixed 320px column for the list pane', () => {
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    const root = container.firstChild
    expect(root.className).toMatch(/grid-cols-\[320px_1fr\]/)
  })

  it('renders aria-label on aside and section when listLabel/detailLabel provided', () => {
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp" />}
        listLabel="Список клиентов"
        detailLabel="Профиль клиента"
      >
        <div data-testid="main" />
      </MasterDetailLayout>,
    )
    expect(screen.getByLabelText('Список клиентов').tagName).toBe('ASIDE')
    expect(screen.getByLabelText('Профиль клиента').tagName).toBe('SECTION')
  })

  it('omits aria-label attribute when labels are undefined', () => {
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    expect(container.querySelector('aside')).not.toHaveAttribute('aria-label')
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label')
  })
})
