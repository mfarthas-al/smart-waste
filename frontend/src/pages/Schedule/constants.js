export const TAX_RATE_PERCENT = 3

export const REQUEST_STATUSES = {
  scheduled: { label: 'Scheduled', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'default' },
  'pending-payment': { label: 'Pending payment', color: 'warning' },
  'payment-failed': { label: 'Payment failed', color: 'error' },
}

export const PAYMENT_STATUSES = {
  success: { label: 'Payment success', color: 'success' },
  pending: { label: 'Payment pending', color: 'warning' },
  failed: { label: 'Payment failed', color: 'error' },
  'not-required': { label: 'No payment required', color: 'default' },
}

export const INITIAL_FORM_STATE = {
  residentName: '',
  ownerName: '',
  address: '',
  district: '',
  email: '',
  phone: '',
  itemType: '',
  preferredDate: '',
  preferredTime: '',
  approxWeight: '',
  quantity: 1,
  specialNotes: '',
}
