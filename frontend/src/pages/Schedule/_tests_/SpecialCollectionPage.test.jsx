import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SpecialCollectionPage from '../SpecialCollectionPage.jsx'

const createJsonResponse = (payload, init = {}) => {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload)
    },
    async json() {
      return payload
    },
  }
}

const futureISO = (hoursAhead = 24) => new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString()

const allowedItems = [
  {
    id: 'yard',
    label: 'Garden trimmings',
    description: 'Garden waste',
    allow: true,
    policy: {},
  },
  {
    id: 'e-waste',
    label: 'Electronic waste',
    description: 'Electronics',
    allow: true,
    policy: { baseFee: 1500 },
  },
]

const defaultSlot = {
  slotId: 'slot-1',
  start: futureISO(48),
  end: futureISO(50),
  capacityLeft: 2,
}

const createFetchMock = (overrides = {}) => {
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    if (overrides[url]) {
      return overrides[url](init)
    }
    if (url === '/api/schedules/special/config') {
      return createJsonResponse({ ok: true, items: allowedItems, slotConfig: { daysAhead: 30, hours: { start: '08:00', end: '18:00' } } })
    }
    if (url.startsWith('/api/schedules/special/my')) {
      return createJsonResponse({ ok: true, requests: [] })
    }
    if (url === '/api/schedules/special/availability') {
      return createJsonResponse({
        ok: true,
        policy: allowedItems[0],
        payment: { required: false, amount: 0, totalWeightKg: 0, weightCharge: 0, taxCharge: 0 },
        slots: [defaultSlot],
      })
    }
    if (url === '/api/schedules/special/confirm') {
      return createJsonResponse({
        ok: true,
        message: 'Special collection scheduled successfully. You will receive a confirmation email shortly.',
        request: {
          _id: 'req-1',
          status: 'scheduled',
          paymentStatus: 'not-required',
          paymentRequired: false,
          slot: defaultSlot,
        },
      })
    }
    throw new Error(`Unhandled fetch call for ${url}`)
  })

  return fetchMock
}

const session = {
  id: 'user-1',
  name: 'Resident One',
  email: 'resident@example.com',
  address: '123 Riverside Ave',
  district: 'Colombo',
  phone: '0771234567',
}

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <SpecialCollectionPage session={session} onSessionInvalid={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  global.fetch = createFetchMock()
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  window.ResizeObserver = window.ResizeObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SpecialCollectionPage', () => {
  it('prefills resident information and validates missing fields before availability check', async () => {
    renderPage()

    const user = userEvent.setup()
    const checkButton = await screen.findByRole('button', { name: /check availability/i })
    await user.click(checkButton)

    await waitFor(() => {
      expect(screen.getByText(/please provide a valid resident name/i)).toBeInTheDocument()
    })
    expect(global.fetch).toHaveBeenCalledWith('/api/schedules/special/config')
  })

  it('completes a zero-cost booking flow without payment', async () => {
  renderPage()

  const user = userEvent.setup()

    const residentName = await screen.findByLabelText(/resident name/i)
    await user.clear(residentName)
    await user.type(residentName, 'Dr Jane Doe')

    const ownerName = screen.getByLabelText(/owner's name/i)
    await user.clear(ownerName)
    await user.type(ownerName, 'John Doe')

    const email = screen.getByLabelText(/email/i)
    await user.clear(email)
    await user.type(email, 'jane@example.com')

    const phone = screen.getByLabelText(/phone/i)
    await user.clear(phone)
    await user.type(phone, '0772223344')

    const address = screen.getByLabelText(/address/i)
    await user.clear(address)
    await user.type(address, '456 Lake Road')

    const district = screen.getByLabelText(/district/i)
    await user.clear(district)
    await user.type(district, 'Kandy')

    const quantity = screen.getByLabelText(/quantity/i)
    await user.clear(quantity)
    await user.type(quantity, '1')

    const weight = screen.getByLabelText(/approx\. weight/i)
    await user.clear(weight)
    await user.type(weight, '5')

    const itemType = screen.getByLabelText(/item type/i)
    await user.click(itemType)
    const listbox = await screen.findByRole('listbox')
    const option = within(listbox).getByText(/garden trimmings/i)
    await user.click(option)

    const todayChip = screen.getByRole('button', { name: /today/i })
    await user.click(todayChip)
    const nineAmChip = screen.getByRole('button', { name: /9:00 am/i })
    await user.click(nineAmChip)

    const checkButton = screen.getByRole('button', { name: /check availability/i })
    await user.click(checkButton)

    const confirmButton = await screen.findByRole('button', { name: /confirm this slot/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/special collection scheduled successfully/i)).toBeInTheDocument()
    })

    const requestsHeading = screen.getByText(/your scheduled pickups/i)
    expect(requestsHeading).toBeInTheDocument()
  })

  it('surfaces configuration errors when the initial fetch fails', async () => {
    global.fetch = createFetchMock({
      '/api/schedules/special/config': () => createJsonResponse({ ok: false, message: 'Config missing' }, { status: 500 }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/config missing/i)).toBeInTheDocument()
    })
  })
})
