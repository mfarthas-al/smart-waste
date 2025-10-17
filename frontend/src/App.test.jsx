import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

vi.mock('@mui/x-date-pickers/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }) => children,
}))

vi.mock('@mui/x-date-pickers/AdapterDayjs', () => ({
  AdapterDayjs: class {},
}))

vi.mock('@mui/x-date-pickers/DateCalendar', () => ({
  DateCalendar: () => null,
}))

vi.mock('@mui/x-date-pickers/DigitalClock', () => ({
  DigitalClock: () => null,
}))

const adminSession = {
  id: 'user-1',
  name: 'Admin One',
  role: 'admin',
  email: 'admin@example.com',
}

describe('App routing and navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('redirects unauthenticated users to the login screen for protected routes', async () => {
    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Sign in to continue/i)).toBeInTheDocument()
  })

  it('shows admin navigation options when an admin session is stored', async () => {
    window.localStorage.setItem('sw-user', JSON.stringify(adminSession))

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /Admin Desk/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Analytics/i })).toBeInTheDocument()
  })
})
