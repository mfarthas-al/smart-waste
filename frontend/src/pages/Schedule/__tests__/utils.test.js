import { describe, expect, it, vi } from 'vitest'
import {
  combineDateAndTime,
  formatCurrency,
  formatRequestTimestamp,
  formatSlotRange,
  getSessionId,
  safeJson,
  serializeDateTime,
} from '../utils.js'

const isoSample = '2025-01-10T08:30:00.000Z'

describe('schedule utils', () => {
  it('formats currency with LKR locale', () => {
    expect(formatCurrency(1234.5)).toContain('1,234.50')
    expect(formatCurrency('foo')).toContain('0.00')
  })

  it('combines date and time safely', () => {
    expect(combineDateAndTime('2025-03-01', '09:15')).toBe('2025-03-01T09:15')
    expect(combineDateAndTime('', '09:15')).toBe('')
    expect(combineDateAndTime('2025-03-01', '')).toBe('')
  })

  it('serializes date time or returns empty string when invalid', () => {
  const iso = new Date('2025-02-02T10:00').toISOString()
  expect(serializeDateTime('2025-02-02T10:00')).toBe(iso)
    expect(serializeDateTime('not-a-date')).toBe('')
    expect(serializeDateTime('')).toBe('')
  })

  it('formats request timestamp gracefully', () => {
    expect(formatRequestTimestamp(isoSample)).toContain('2025')
    expect(formatRequestTimestamp('')).toBe('—')
  })

  it('formats slot range with arrow or fallback when invalid', () => {
    const slot = {
      start: '2025-01-01T08:00:00.000Z',
      end: '2025-01-01T09:00:00.000Z',
    }
    expect(formatSlotRange(slot)).toContain('→')
    expect(formatSlotRange({})).toBe('Awaiting assignment')
  })

  it('gets session id using fallbacks', () => {
    expect(getSessionId({ id: '123' })).toBe('123')
    expect(getSessionId({ _id: '456' })).toBe('456')
    expect(getSessionId({})).toBe('')
  })

  it('parses json safely and logs a warning for invalid payload', async () => {
    const good = await safeJson(new Response('{"ok":true}'))
    expect(good).toEqual({ ok: true })

    const empty = await safeJson(new Response(''))
    expect(empty).toBeNull()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await safeJson(new Response('not-json'))
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
