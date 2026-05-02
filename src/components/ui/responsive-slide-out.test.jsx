import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}))

import { ResponsiveSlideOut } from './responsive-slide-out.jsx'
import { useIsMobile } from '@/hooks/use-mobile'

beforeEach(() => {
  useIsMobile.mockReset()
})

describe('ResponsiveSlideOut', () => {
  it('renders title + content + footer', () => {
    useIsMobile.mockReturnValue(false)
    render(
      <ResponsiveSlideOut
        open
        onOpenChange={() => {}}
        title="Test Title"
        footer={<button>Footer Button</button>}
      >
        <div>Form Content</div>
      </ResponsiveSlideOut>,
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Form Content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Footer Button' })).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when user presses Esc', () => {
    useIsMobile.mockReturnValue(false)
    const onOpenChange = vi.fn()
    render(
      <ResponsiveSlideOut open onOpenChange={onOpenChange} title="X">
        <div>content</div>
      </ResponsiveSlideOut>,
    )
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('forwards onKeyDown to root content', () => {
    useIsMobile.mockReturnValue(false)
    const onKeyDown = vi.fn()
    render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="X" onKeyDown={onKeyDown}>
        <input data-testid="input" />
      </ResponsiveSlideOut>,
    )
    fireEvent.keyDown(screen.getByTestId('input'), { key: 'Enter', metaKey: true })
    expect(onKeyDown).toHaveBeenCalled()
  })

  it('renders Drawer on mobile and Sheet on desktop', () => {
    // Mobile branch
    useIsMobile.mockReturnValue(true)
    const { unmount } = render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="Mobile">
        <div>m</div>
      </ResponsiveSlideOut>,
    )
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    unmount()

    // Desktop branch
    useIsMobile.mockReturnValue(false)
    render(
      <ResponsiveSlideOut open onOpenChange={() => {}} title="Desktop">
        <div>d</div>
      </ResponsiveSlideOut>,
    )
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
  })
})
