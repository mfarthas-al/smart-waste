import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AvailabilitySection } from '../components/AvailabilitySection.jsx'

const baseSlot = {
  slotId: 'slot-1',
  start: '2025-01-05T08:00:00.000Z',
  end: '2025-01-05T09:00:00.000Z',
  capacityLeft: 2,
}

const baseAvailability = {
  slots: [baseSlot],
  payment: {
    required: false,
    amount: 0,
    totalWeightKg: 30,
    weightCharge: 0,
    taxCharge: 0,
  },
}

describe('AvailabilitySection', () => {
  it('renders nothing when availability is null', () => {
    const { container } = render(
      <AvailabilitySection
        availability={null}
        loading={false}
        onConfirmSlot={vi.fn()}
        bookingInFlight={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows loading spinner while availability is loading', () => {
    render(
      <AvailabilitySection
        availability={{ slots: [] }}
        loading
        onConfirmSlot={vi.fn()}
        bookingInFlight={false}
      />,
    )

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows warning when no slots are available', () => {
    render(
      <AvailabilitySection
        availability={{ slots: [] }}
        loading={false}
        onConfirmSlot={vi.fn()}
        bookingInFlight={false}
      />,
    )

    expect(screen.getByText(/No slots are available/)).toBeInTheDocument()
  })

  it('renders slots and triggers confirmation callback', () => {
    const onConfirm = vi.fn()

    render(
      <AvailabilitySection
        availability={baseAvailability}
        loading={false}
        onConfirmSlot={onConfirm}
        bookingInFlight={false}
      />,
    )

    fireEvent.click(screen.getByText('Confirm this slot'))
    expect(onConfirm).toHaveBeenCalledWith(baseSlot)
    expect(screen.getByText(/No payment required/)).toBeInTheDocument()
  })

  it('renders payment required alert when payment is needed', () => {
    render(
      <AvailabilitySection
        availability={{
          ...baseAvailability,
          payment: {
            required: true,
            amount: 5000,
            totalWeightKg: 50,
            weightCharge: 1000,
            taxCharge: 500,
          },
        }}
        loading={false}
        onConfirmSlot={vi.fn()}
        bookingInFlight={false}
      />,
    )

    expect(screen.getByText(/Payment required/)).toBeInTheDocument()
    expect(screen.getByText(/Taxes applied/)).toBeInTheDocument()
  })
})
