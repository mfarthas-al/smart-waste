import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResidentRequests } from '../hooks/useResidentRequests.js'

const requestsPayload = {
  ok: true,
  requests: [
    { id: 'req-1', itemType: 'sofa' },
  ],
}

describe('useResidentRequests', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty state when no session id is provided', async () => {
    const onInvalid = vi.fn()
    const { result } = renderHook(() => useResidentRequests('', onInvalid))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.requests).toEqual([])
    expect(onInvalid).not.toHaveBeenCalled()
  })

  it('loads resident requests successfully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(requestsPayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const { result } = renderHook(() => useResidentRequests('user-1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.requests).toHaveLength(1)

    await waitFor(async () => {
      await result.current.refresh()
    })

    expect(result.current.requests[0].id).toBe('req-1')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('invokes session invalid callback on forbidden responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, message: 'invalid session' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })))

    const onInvalid = vi.fn()
    renderHook(() => useResidentRequests('user-2', onInvalid))

    await waitFor(() => {
      expect(onInvalid).toHaveBeenCalledWith('invalid session')
    })
  })

  it('reports errors when loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, message: 'server down' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })))

    const { result } = renderHook(() => useResidentRequests('user-3'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('server down')
    expect(result.current.requests).toEqual([])
  })
})
