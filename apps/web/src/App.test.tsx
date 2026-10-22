import { describe, expect, it } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'

describe('App', () => {
  it('shows the app name as the single page heading', () => {
    render(<App />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Campfire of the Damned')
  })

  it('does not call the network on first render', () => {
    // The setup file makes fetch throw; rendering must not trigger it.
    expect(() => render(<App />)).not.toThrow()
  })
})
