import { createContext, useContext, useEffect, useState } from 'react'

const SectionTitleContext = createContext({
  title: '',
  backTo: null,
  setTitle: () => {},
  setBackTo: () => {},
})

/**
 * Provider for section title state. Wrap mobile shell so that
 * page components can publish their title via useSectionTitle()
 * and MobileTopBar can read it via useSectionTitleValue().
 */
export function SectionTitleProvider({ children }) {
  const [title, setTitle] = useState('')
  const [backTo, setBackTo] = useState(null)
  return (
    <SectionTitleContext.Provider value={{ title, backTo, setTitle, setBackTo }}>
      {children}
    </SectionTitleContext.Provider>
  )
}

/**
 * Page-side hook: publish the section title (and optional backTo) for the
 * current route. Cleared automatically on unmount.
 *
 * @param {string} title — what to show in MobileTopBar.
 * @param {{ backTo?: string|null }} [options]
 *   backTo: when set, MobileTopBar renders a back arrow that navigates here
 *   instead of opening the drawer.
 */
export function useSectionTitle(title, options = {}) {
  const { setTitle, setBackTo } = useContext(SectionTitleContext)
  const backTo = options.backTo ?? null
  useEffect(() => {
    setTitle(title)
    setBackTo(backTo)
    return () => {
      setTitle('')
      setBackTo(null)
    }
  }, [title, backTo, setTitle, setBackTo])
}

/**
 * Reader-side hook (for MobileTopBar). Outside provider returns
 * `{ title: '', backTo: null }`.
 */
export function useSectionTitleValue() {
  const { title, backTo } = useContext(SectionTitleContext)
  return { title, backTo }
}
