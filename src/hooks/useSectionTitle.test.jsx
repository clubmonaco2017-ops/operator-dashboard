import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SectionTitleProvider, useSectionTitle, useSectionTitleValue } from './useSectionTitle.jsx'

function ReaderProbe() {
  const { title, backTo } = useSectionTitleValue()
  return (
    <div data-testid="probe">
      <span data-testid="title">{title}</span>
      <span data-testid="backTo">{backTo ?? ''}</span>
    </div>
  )
}

function WriterProbe({ title, backTo }) {
  useSectionTitle(title, { backTo })
  return null
}

describe('useSectionTitle', () => {
  it('Provider initializes title and backTo to empty/null', () => {
    render(
      <SectionTitleProvider>
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('useSectionTitle sets title on mount', () => {
    render(
      <SectionTitleProvider>
        <WriterProbe title="Задачи" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('Задачи')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('useSectionTitle sets backTo when option provided', () => {
    render(
      <SectionTitleProvider>
        <WriterProbe title="Клиент B" backTo="/clients" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('Клиент B')
    expect(screen.getByTestId('backTo')).toHaveTextContent('/clients')
  })

  it('clears title and backTo on unmount', () => {
    function Toggler({ show }) {
      return show ? <WriterProbe title="X" backTo="/y" /> : null
    }
    const { rerender } = render(
      <SectionTitleProvider>
        <Toggler show={true} />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('X')
    rerender(
      <SectionTitleProvider>
        <Toggler show={false} />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })

  it('updates title when prop changes', () => {
    const { rerender } = render(
      <SectionTitleProvider>
        <WriterProbe title="A" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('A')
    rerender(
      <SectionTitleProvider>
        <WriterProbe title="B" />
        <ReaderProbe />
      </SectionTitleProvider>,
    )
    expect(screen.getByTestId('title')).toHaveTextContent('B')
  })

  it('returns default values when used outside provider', () => {
    render(<ReaderProbe />)
    expect(screen.getByTestId('title')).toHaveTextContent('')
    expect(screen.getByTestId('backTo')).toHaveTextContent('')
  })
})
