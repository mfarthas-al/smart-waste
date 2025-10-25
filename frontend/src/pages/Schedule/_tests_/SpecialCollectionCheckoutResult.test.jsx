import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SpecialCollectionCheckoutResult from '../SpecialCollectionCheckoutResult.jsx'

const originalCreateObjectURL = window.URL?.createObjectURL
const originalRevokeObjectURL = window.URL?.revokeObjectURL

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

const createBlobResponse = blob => ({
  ok: true,
  status: 200,
  async blob() {
    return blob
  },
  async json() {
    return {}
  },
})

const futureISO = () => new Date(Date.now() + 3600 * 1000).toISOString()

beforeEach(() => {
  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  window.URL.revokeObjectURL = vi.fn()
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => undefined)
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.URL.createObjectURL = originalCreateObjectURL
  window.URL.revokeObjectURL = originalRevokeObjectURL
  // eslint-disable-next-line no-undef
  global.fetch = undefined
})

describe('SpecialCollectionCheckoutResult', () => {
  it('shows an error when no checkout session is provided', async () => {
    render(
      <MemoryRouter initialEntries={['/schedule/payment/result']}>
        <Routes>
          <Route path="/schedule/payment/result" element={<SpecialCollectionCheckoutResult session={null} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/missing checkout session/i)).toBeInTheDocument()
  })

  it('renders payment confirmation and downloads receipt', async () => {
    const fetchMock = vi.fn(async input => {
      const url = typeof input === 'string' ? input : input.url
      if (url.startsWith('/api/schedules/special/payment/checkout/')) {
        return createJsonResponse({
          ok: true,
          status: 'success',
          request: {
            _id: 'req-1',
            userId: 'user-1',
            slot: { start: futureISO() },
            address: '123 Street',
            district: 'Colombo',
            contactPhone: '0771234567',
            contactEmail: 'resident@example.com',
            quantity: 2,
            paymentAmount: 2400,
            approxWeightKg: 12,
            totalWeightKg: 24,
          },
        })
      }
      if (url.startsWith('/api/schedules/special/requests/')) {
        return createBlobResponse(new Blob(['pdf'], { type: 'application/pdf' }))
      }
      throw new Error(`Unexpected fetch call for ${url}`)
    })

  global.fetch = fetchMock

    const session = { id: 'user-1', role: 'resident' }

    render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=sess_123&status=success']}>
        <Routes>
          <Route
            path="/schedule/payment/result"
            element={<SpecialCollectionCheckoutResult session={session} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/payment successful/i)).toBeInTheDocument()

    const user = userEvent.setup()
    const downloadButton = await screen.findByRole('button', { name: /download/i })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/requests/req-1/receipt'))
    })
    expect(window.URL.createObjectURL).toHaveBeenCalled()
  })

  it('surfaces failure messaging when checkout verification fails', async () => {
  const fetchMock = vi.fn(async input => {
      const url = typeof input === 'string' ? input : input.url
      if (url.startsWith('/api/schedules/special/payment/checkout/')) {
        return createJsonResponse({ ok: false, message: 'Payment was not completed.' }, { status: 402 })
      }
      return createJsonResponse({})
    })

  global.fetch = fetchMock

    render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=sess_fail&status=cancelled']}>
        <Routes>
          <Route path="/schedule/payment/result" element={<SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'resident' }} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/payment not completed/i)).toBeInTheDocument()
  })
})
