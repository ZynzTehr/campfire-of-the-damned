import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vite-plus/test'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
  setReducedMotion(true)
})

// Network tripwire: tests must never reach a real server.
// Tests that need fetch replace it explicitly with a fake.
globalThis.fetch = () => {
  throw new Error('Network access in tests is not allowed. Stub fetch in the test.')
}

// jsdom has no matchMedia. Default to reduced motion so stories appear at once;
// tests of the typing effect switch it off.
let reduced = true
export function setReducedMotion(on: boolean) {
  reduced = on
}
window.matchMedia = ((query: string) => ({
  matches: query.includes('prefers-reduced-motion') ? reduced : false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia
