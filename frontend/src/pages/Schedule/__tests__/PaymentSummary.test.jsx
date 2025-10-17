import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentSummary } from '../components/PaymentSummary.jsx'

const basePayment = {
  required: true,
  amount: 3500,
  baseCharge: 3000,
  weightCharge: 200,
  taxCharge: 300,
}

describe('PaymentSummary', () => {
  it('renders informative text when no payment data is available', () => {
    render(<PaymentSummary payment={null} />)
    expect(screen.getByText(/enter your request details/i)).toBeInTheDocument()
  })

  it('renders payment breakdown with totals', () => {
    render(<PaymentSummary payment={basePayment} showBreakdown />)

    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('Extra charges')).toBeInTheDocument()
  expect(screen.getByText('Tax')).toBeInTheDocument()
  expect(screen.getByText(/Municipal levy/)).toHaveTextContent('3')
  expect(screen.getByText(/Total/)).toHaveTextContent('Total')
  const currencyEntries = screen.getAllByText((content) => content.includes('LKR'))
  expect(currencyEntries.length).toBeGreaterThan(0)
  })

  it('renders success alert when payment is not required', () => {
    render(<PaymentSummary payment={{ ...basePayment, required: false, amount: 0 }} />)
    expect(screen.getByText(/No payment required/)).toBeInTheDocument()
  })
})
