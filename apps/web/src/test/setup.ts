import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vite-plus/test'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// Network tripwire: tests must never reach a real server.
// Tests that need fetch replace it explicitly with a fake.
globalThis.fetch = () => {
  throw new Error('Network access in tests is not allowed. Stub fetch in the test.')
}
