import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchInput } from './SearchInput.jsx'

describe('<SearchInput>', () => {
  it('renders search input with placeholder, value, and aria-label', () => {
    render(
      <SearchInput
        placeholder="Поиск клиентов"
        value="абв"
        onChange={() => {}}
        ariaLabel="Поиск по клиентам"
      />,
    )
    const input = screen.getByRole('searchbox', { name: 'Поиск по клиентам' })
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Поиск клиентов')
    expect(input).toHaveValue('абв')
  })

  it('calls onChange with the new value when user types', () => {
    const onChange = vi.fn()
    render(
      <SearchInput
        placeholder="Поиск"
        value=""
        onChange={onChange}
        ariaLabel="Поиск"
      />,
    )
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'тест' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('тест')
  })

  it('renders the lucide Search icon (decorative)', () => {
    const { container } = render(
      <SearchInput placeholder="P" value="" onChange={() => {}} ariaLabel="A" />,
    )
    const svg = container.querySelector('svg[aria-hidden]')
    expect(svg).toBeInTheDocument()
  })
})
