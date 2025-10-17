const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0)
  }
  return currencyFormatter.format(value)
}

export function toLocalDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function combineDateAndTime(date, time) {
  if (!date || !time) {
    return ''
  }
  return `${date}T${time}`
}

export function serializeDateTime(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toISOString()
}

export function formatRequestTimestamp(value) {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatSlotRange(slot) {
  if (!slot?.start) {
    return 'Awaiting assignment'
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const start = formatter.format(new Date(slot.start))
    const end = slot.end ? formatter.format(new Date(slot.end)) : null
    return end ? `${start} → ${end}` : start
  } catch {
    return 'Awaiting assignment'
  }
}

export function getSessionId(session) {
  return session?.id || session?._id || ''
}

export async function safeJson(response) {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn('Failed to parse JSON payload', error)
    return null
  }
}
