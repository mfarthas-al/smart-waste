import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpecialCollectionPaymentSuccessCard from '../SpecialCollectionPaymentSuccessCard.jsx'

describe('SpecialCollectionPaymentSuccessCard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('displays collection details and handles receipt actions', async () => {
    const onDownloadReceipt = vi.fn()
    const onFollowUp = vi.fn()
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <SpecialCollectionPaymentSuccessCard
        request={{
          address: '123 Sample Avenue',
          district: 'Colombo',
          itemLabel: 'Old Sofa',
          contactPhone: '+94 77 123 4567',
          contactEmail: 'resident@example.com',
          quantity: 2,
          totalWeightKg: 75,
          slot: { start: '2025-02-01T08:30:00.000Z' },
        }}
        payment={{ total: 5000, subtotal: 4200, extraCharge: 500, tax: 300, currency: 'LKR' }}
        onDownloadReceipt={onDownloadReceipt}
        stripeReceiptUrl="https://stripe.example/receipt"
        actions={[{ label: 'Schedule another pickup', onClick: onFollowUp }]}
      />,
    )

    expect(screen.getByText(/Payment Successful/i)).toBeInTheDocument()
    expect(screen.getByText(/123 Sample Avenue/i)).toBeInTheDocument()
    expect(screen.getByText(/Old Sofa/i)).toBeInTheDocument()
    expect(screen.getByText(/Schedule another pickup/i)).toBeInTheDocument()

    const totalDisplay = screen.getByText((content) => content.includes('5,000.00'))
    expect(totalDisplay).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Download PDF/i }))
    expect(onDownloadReceipt).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /View Stripe receipt/i }))
    expect(openSpy).toHaveBeenCalledWith('https://stripe.example/receipt', '_blank', 'noopener,noreferrer')

    await user.click(screen.getByRole('button', { name: /Schedule another pickup/i }))
    expect(onFollowUp).toHaveBeenCalled()
  })
})
