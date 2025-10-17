import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduledRequests } from '../components/ScheduledRequests.jsx'

const allowedItems = [
  { id: 'sofa', label: 'Upholstered Sofa' },
]

afterEach(() => {
  cleanup()
})

function buildRequest(overrides = {}) {
  return {
    _id: 'req-1',
    itemType: 'sofa',
    quantity: 2,
    totalWeightKg: 45,
    createdAt: '2025-01-01T08:00:00.000Z',
    slot: {
      start: '2025-01-05T08:00:00.000Z',
      end: '2025-01-05T09:00:00.000Z',
    },
    status: 'scheduled',
    paymentStatus: 'not-required',
    ...overrides,
  }
}

describe('ScheduledRequests', () => {
  it('renders request details and status chips', () => {
    render(
      <ScheduledRequests
        requests={[buildRequest()]}
        loading={false}
        error={null}
        allowedItems={allowedItems}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Upholstered Sofa')).toBeInTheDocument()
    expect(screen.getByText('Quantity: 2')).toBeInTheDocument()
    expect(screen.getByText(/Estimated total weight/)).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('No payment required')).toBeInTheDocument()
  })

  it('shows a spinner while loading initial data', () => {
    render(
      <ScheduledRequests
        requests={[]}
        loading
        error={null}
        allowedItems={allowedItems}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders an error message when provided', () => {
    render(
      <ScheduledRequests
        requests={[]}
        loading={false}
        error="Unable to load"
        allowedItems={allowedItems}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Unable to load')).toBeInTheDocument()
  })

  it('renders empty state and allows refresh trigger', async () => {
    const onRefresh = vi.fn()
    const user = userEvent.setup()

    render(
      <ScheduledRequests
        requests={[]}
        loading={false}
        error={null}
        allowedItems={allowedItems}
        onRefresh={onRefresh}
      />,
    )

    const emptyMessages = screen.getAllByText(/have not scheduled any/i)
    expect(emptyMessages.length).toBeGreaterThan(0)

    const refreshButton = screen
      .getAllByRole('button', { name: /refresh scheduled pickups/i })
      .find(btn => !btn.hasAttribute('disabled'))

    expect(refreshButton).toBeDefined()

    await user.click(refreshButton)

    expect(onRefresh).toHaveBeenCalled()
  })
})
