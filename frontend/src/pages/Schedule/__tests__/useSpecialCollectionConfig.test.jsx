import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpecialCollectionConfig } from '../hooks/useSpecialCollectionConfig.js'

const mockConfigResponse = {
  ok: true,
  items: [
    { id: 'sofa', label: 'Sofa', allow: true },
    { id: 'tv', label: 'TV', allow: false },
  ],
  slotConfig: {
    daysAhead: 7,
    hours: { start: '08:00', end: '17:00' },
  },
}

describe('useSpecialCollectionConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads configuration successfully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockConfigResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const { result } = renderHook(() => useSpecialCollectionConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.items).toHaveLength(2)
    expect(result.current.slotConfig).toEqual(mockConfigResponse.slotConfig)
  })

  it('captures errors from unsuccessful responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, message: 'config missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })))

    const { result } = renderHook(() => useSpecialCollectionConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toContain('config missing')
    expect(result.current.items).toEqual([])
  })

  it('handles network failures gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))

    const { result } = renderHook(() => useSpecialCollectionConfig())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('network down')
    expect(result.current.items).toEqual([])
  })
})
