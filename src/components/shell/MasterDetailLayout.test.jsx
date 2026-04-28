import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: vi.fn() }))

import { MasterDetailLayout } from './MasterDetailLayout.jsx'
import { useIsMobile } from '@/hooks/use-mobile'

beforeEach(() => vi.clearAllMocks())

describe('<MasterDetailLayout> desktop', () => {
  it('renders listPane in left aside and children in main section', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <MasterDetailLayout listPane={<div data-testid="lp">List Content</div>}>
        <div data-testid="main">Main Content</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List Content')
    expect(screen.getByTestId('main')).toHaveTextContent('Main Content')
  })

  it('uses fixed 320px column for the list pane', () => {
    useIsMobile.mockReturnValue(false)
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    const root = container.firstChild
    expect(root.className).toMatch(/grid-cols-\[320px_1fr\]/)
  })

  it('renders aria-label on aside and section when listLabel/detailLabel provided', () => {
    useIsMobile.mockReturnValue(false)
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
    useIsMobile.mockReturnValue(false)
    const { container } = render(
      <MasterDetailLayout listPane={<div />}>
        <div />
      </MasterDetailLayout>,
    )
    expect(container.querySelector('aside')).not.toHaveAttribute('aria-label')
    expect(container.querySelector('section')).not.toHaveAttribute('aria-label')
  })
})

describe('<MasterDetailLayout> mobile', () => {
  it('renders only listPane when detailEmpty=true', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp">List</div>}
        detailEmpty={true}
        listLabel="L"
        detailLabel="D"
      >
        <div data-testid="main">Main</div>
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toHaveTextContent('List')
    expect(screen.queryByTestId('main')).toBeNull()
    expect(screen.getByLabelText('L').tagName).toBe('ASIDE')
    expect(screen.queryByLabelText('D')).toBeNull()
  })

  it('renders only children when detailEmpty=false', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout
        listPane={<div data-testid="lp">List</div>}
        detailEmpty={false}
        listLabel="L"
        detailLabel="D"
      >
        <div data-testid="main">Main</div>
      </MasterDetailLayout>,
    )
    expect(screen.queryByTestId('lp')).toBeNull()
    expect(screen.getByTestId('main')).toHaveTextContent('Main')
    expect(screen.getByLabelText('D').tagName).toBe('SECTION')
    expect(screen.queryByLabelText('L')).toBeNull()
  })

  it('treats omitted detailEmpty as truthy (defaults to list view)', () => {
    useIsMobile.mockReturnValue(true)
    render(
      <MasterDetailLayout listPane={<div data-testid="lp" />}>
        <div data-testid="main" />
      </MasterDetailLayout>,
    )
    expect(screen.getByTestId('lp')).toBeInTheDocument()
    expect(screen.queryByTestId('main')).toBeNull()
  })
})
