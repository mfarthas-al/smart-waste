import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import SpecialCollectionPage from '../SpecialCollectionPage.jsx'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

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

const session = {
  id: 'resident-1',
  name: 'Alex Householder',
  householdOwnerName: 'Alex Householder',
  address: '123 Test Lane',
  district: 'Colombo',
  email: 'alex@example.com',
  phone: '+94111222333',
}

const slotStart = '2025-02-02T08:00:00.000Z'
const slotEnd = '2025-02-02T09:00:00.000Z'

function buildConfigResponse() {
  return {
    ok: true,
    items: [
      { id: 'bulky', label: 'Bulky item', allow: true },
    ],
    slotConfig: {
      daysAhead: 7,
      disableWeekends: false,
      hours: { start: '08:00', end: '17:00' },
      timeStepMinutes: 60,
    },
  }
}

function buildAvailabilityResponse() {
  return {
    ok: true,
    slots: [
      {
        slotId: 'slot-1',
        start: slotStart,
        end: slotEnd,
        capacityLeft: 1,
      },
    ],
    payment: {
      required: false,
      amount: 0,
      baseCharge: 0,
      weightCharge: 0,
      taxCharge: 0,
    },
  }
}

function buildConfirmResponse() {
  return {
    ok: true,
    message: 'Pickup scheduled successfully',
    request: {
      status: 'scheduled',
      paymentStatus: 'not-required',
      slot: {
        start: slotStart,
        end: slotEnd,
      },
      billingId: 'bill-1',
    },
  }
}

function setupGlobalStubs() {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
  }
  window.print = vi.fn()
}

describe('SpecialCollectionPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    navigateMock.mockReset()
    setupGlobalStubs()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('completes the happy path flow and shows confirmation and history', async () => {
    let residentRequests = []

    const fetchMock = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/api/schedules/special/config')) {
        return new Response(JSON.stringify(buildConfigResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.startsWith('/api/schedules/special/my')) {
        return new Response(JSON.stringify({ ok: true, requests: residentRequests }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/schedules/special/availability')) {
        expect(init.method).toBe('POST')
        return new Response(JSON.stringify(buildAvailabilityResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/schedules/special/confirm')) {
        expect(init.method).toBe('POST')
        residentRequests = [
          {
            id: 'request-1',
            itemType: 'bulky',
            quantity: 1,
            totalWeightKg: 25,
            createdAt: '2025-02-01T04:00:00.000Z',
            slot: { start: slotStart, end: slotEnd },
            status: 'scheduled',
            paymentStatus: 'not-required',
          },
        ]
        return new Response(JSON.stringify(buildConfirmResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

  const user = userEvent.setup()

  render(<SpecialCollectionPage session={session} onSessionInvalid={vi.fn()} />)

  const [weightField] = await screen.findAllByLabelText(/Approx\. weight \(kg per item\)/i)
  await user.type(weightField, '25')

    fireEvent.click(screen.getByText('Today'))
    fireEvent.click(screen.getByText('08:00'))

  await user.click(screen.getByRole('button', { name: /Check availability/i }))

    await waitFor(() => {
      expect(screen.getByText(/Confirm this slot/)).toBeInTheDocument()
    })

  await user.click(screen.getByText('Confirm this slot'))

    await waitFor(() => {
      expect(screen.getByText(/Pickup scheduled successfully/)).toBeInTheDocument()
    })

    expect(screen.getByText(/Request Confirmed/)).toBeInTheDocument()
    expect(screen.getByText(/Schedule another pickup/)).toBeInTheDocument()
    expect(screen.getByText(/Your scheduled pickups/)).toBeInTheDocument()
    expect(screen.queryByText(/Upholstered/)).not.toBeInTheDocument()
  expect(screen.getAllByText(/Bulky item/).length).toBeGreaterThan(0)
  })

  it('shows configuration error and prevents interactions when config fails', async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/api/schedules/special/config')) {
        return new Response(JSON.stringify({ ok: false, message: 'config not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.startsWith('/api/schedules/special/my')) {
        return new Response(JSON.stringify({ ok: true, requests: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

  render(<SpecialCollectionPage session={session} onSessionInvalid={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/config not available/i)).toBeInTheDocument()
    })
  })

  it('displays form validation feedback when required inputs are missing', async () => {
    let availabilityAttempts = 0

    const fetchMock = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url
      if (url.endsWith('/api/schedules/special/config')) {
        return new Response(JSON.stringify(buildConfigResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.startsWith('/api/schedules/special/my')) {
        return new Response(JSON.stringify({ ok: true, requests: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.endsWith('/api/schedules/special/availability')) {
        availabilityAttempts += 1
        return new Response(JSON.stringify({ ok: false, message: 'No crews available' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

  const user = userEvent.setup()

  render(<SpecialCollectionPage session={session} onSessionInvalid={vi.fn()} />)

  const [weightField] = await screen.findAllByLabelText(/Approx\. weight \(kg per item\)/i)
  await user.type(weightField, '20')

    fireEvent.click(screen.getByText('Today'))
    fireEvent.click(screen.getByText('08:00'))

  await user.click(screen.getByRole('button', { name: /Check availability/i }))

    await waitFor(() => {
      expect(screen.getByText('No crews available')).toBeInTheDocument()
    })

    expect(availabilityAttempts).toBe(1)
  })
})
