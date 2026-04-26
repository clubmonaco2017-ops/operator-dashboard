import '@testing-library/jest-dom/vitest'

// matchMedia is not implemented in jsdom — stub globally for all tests
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
}
