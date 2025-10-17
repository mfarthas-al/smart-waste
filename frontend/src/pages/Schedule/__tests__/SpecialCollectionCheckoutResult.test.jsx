import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpecialCollectionCheckoutResult from '../SpecialCollectionCheckoutResult.jsx'

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  successCardProps: { current: null },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mocks.navigateMock,
  }
})

vi.mock('../../../components/SpecialCollectionPaymentSuccessCard.jsx', () => ({
  default: props => {
    mocks.successCardProps.current = props
    return (
      <div data-testid="success-card">
        <span data-testid="success-item">{props.request?.itemLabel}</span>
        <button type="button" onClick={props.onDownloadReceipt} disabled={props.downloadPending}>
          Download receipt
        </button>
        {(props.actions || []).map(action => (
          <button type="button" key={action.label} onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    )
  },
}))

vi.mock('../../assets/Confirmation.png', () => 'confirmation.png', { virtual: true })

describe('SpecialCollectionCheckoutResult', () => {
  beforeEach(() => {
    mocks.navigateMock.mockReset()
    mocks.successCardProps.current = null
  })

  afterEach(() => {
    cleanup()
    mocks.navigateMock.mockReset()
    mocks.successCardProps.current = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows an error when the checkout session is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/schedule/payment/result']}>
        <SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'resident' }} />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Missing checkout session/i)).toBeInTheDocument()
  })

  it('renders the success card and wires navigation actions', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/checkout/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            request: {
              _id: 'req-123',
              itemLabel: 'Bulky Waste',
              stripeReceiptUrl: 'https://stripe.example',
            },
          }),
        })
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc&status=success']}>
        <SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'admin' }} />
      </MemoryRouter>,
    )

    const successCards = await within(container).findAllByTestId('success-card')
    const latestSuccessCard = successCards[successCards.length - 1]
    expect(latestSuccessCard).toHaveTextContent(/Bulky Waste/)
    expect(fetchMock).toHaveBeenCalledWith('/api/schedules/special/payment/checkout/abc?status=success')

    const dashboardButtons = within(container).getAllByRole('button', { name: 'Go to Dashboard' })
    const scheduleButtons = within(container).getAllByRole('button', { name: 'Schedule Another Pickup' })
    const dashboardButton = dashboardButtons[dashboardButtons.length - 1]
    const scheduleButton = scheduleButtons[scheduleButtons.length - 1]

    await user.click(dashboardButton)
    await user.click(scheduleButton)

    expect(mocks.navigateMock).toHaveBeenNthCalledWith(1, '/adminDashboard', { replace: true })
    expect(mocks.navigateMock).toHaveBeenNthCalledWith(2, '/schedule', { replace: true })
  })

  it('downloads the receipt for a completed request', async () => {
    let resolveReceiptRequest
    const receiptResponsePromise = new Promise((resolve) => {
      resolveReceiptRequest = () => resolve({
        ok: true,
        blob: async () => new Blob(['pdf']),
      })
    })

    const fetchMock = vi.fn((url) => {
      const urlString = String(url)
      if (urlString.includes('/checkout/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            request: {
              _id: 'req-999',
              itemLabel: 'Garden Waste',
              stripeReceiptUrl: 'https://stripe.example',
            },
          }),
        })
      }
      if (urlString.includes('/receipt')) {
        return receiptResponsePromise
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURLSpy = vi.fn(() => 'blob:url')
    const revokeObjectURLSpy = vi.fn()
    URL.createObjectURL = createObjectURLSpy
    URL.revokeObjectURL = revokeObjectURLSpy
    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const removeChildSpy = vi.spyOn(document.body, 'removeChild')
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()

    try {
      const { container } = render(
        <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc&status=success']}>
          <SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'resident' }} />
        </MemoryRouter>,
      )

      const downloadButtons = await within(container).findAllByRole('button', { name: /download receipt/i })
      const downloadButton = downloadButtons[downloadButtons.length - 1]
      expect(downloadButton).not.toBeDisabled()

      await user.click(downloadButton)

      await waitFor(() => expect(downloadButton).toBeDisabled())

      resolveReceiptRequest()

      await waitFor(() => expect(downloadButton).not.toBeDisabled())

      await waitFor(() => {
        const receiptCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/receipt'))
        expect(receiptCall?.[0]).toBe('/api/schedules/special/requests/req-999/receipt?userId=user-1')
      })

      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalled()
      expect(appendChildSpy).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalled()
      expect(anchorClickSpy).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
      anchorClickSpy.mockRestore()
    }
  })

  it('alerts when identifiers are missing for receipt download', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/checkout/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            request: {
              itemLabel: 'Organic Waste',
            },
          }),
        })
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc&status=success']}>
        <SpecialCollectionCheckoutResult session={{}} />
      </MemoryRouter>,
    )

    const downloadButtons = await within(container).findAllByRole('button', { name: /download receipt/i })
    await user.click(downloadButtons[downloadButtons.length - 1])

    expect(alertSpy).toHaveBeenCalledWith('We could not verify your session. Please sign in again to download the receipt.')
    const receiptCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/receipt'))
    expect(receiptCalls).toHaveLength(0)
  })

  it('surfaces an error when the checkout sync fails', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/checkout/')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'Payment failed stub' }),
        })
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc&status=failed']}>
        <SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'resident' }} />
      </MemoryRouter>,
    )

    expect(await within(container).findByText(/Payment failed stub/i)).toBeInTheDocument()
    expect(within(container).getAllByText(/Payment not completed/i).length).toBeGreaterThan(0)
  })

  it('shows an informational message when payment status is pending', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).includes('/checkout/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'processing',
            request: null,
          }),
        })
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc']}>
        <SpecialCollectionCheckoutResult session={{ id: 'user-1', role: 'resident' }} />
      </MemoryRouter>,
    )

    expect(await within(container).findByText(/We have recorded your visit/i)).toBeInTheDocument()
    expect(within(container).queryAllByTestId('success-card')).toHaveLength(0)
  })

  it('alerts the user when receipt download fails with server message', async () => {
    const fetchMock = vi.fn((url) => {
      const urlString = String(url)
      if (urlString.includes('/checkout/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'success',
            request: {
              _id: 'req-321',
              itemLabel: 'Metal Waste',
            },
          }),
        })
      }
      if (urlString.includes('/receipt')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ message: 'Receipt locked' }),
        })
      }
      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    const { container } = render(
      <MemoryRouter initialEntries={['/schedule/payment/result?session_id=abc&status=success']}>
        <SpecialCollectionCheckoutResult session={{ id: 'resident-1', role: 'resident' }} />
      </MemoryRouter>,
    )

    const downloadButtons = await within(container).findAllByRole('button', { name: /download receipt/i })
    await user.click(downloadButtons[downloadButtons.length - 1])

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Receipt locked'))
    expect(consoleSpy).toHaveBeenCalled()
  })
})
