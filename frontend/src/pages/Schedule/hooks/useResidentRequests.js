import { useCallback, useEffect, useState } from 'react'
import { safeJson } from '../utils.js'

export function useResidentRequests(sessionId, onSessionInvalid) {
  const [state, setState] = useState({ loading: false, error: null, requests: [] })

  const load = useCallback(async () => {
    if (!sessionId) {
      setState({ loading: false, error: null, requests: [] })
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(`/api/schedules/special/my?userId=${encodeURIComponent(sessionId)}`)
      const payload = await safeJson(response)

      if (!response.ok || payload?.ok === false) {
        const message = payload?.message || 'Unable to load your scheduled pickups'
        if (response.status === 403 || response.status === 404) {
          onSessionInvalid?.(message)
          return
        }
        throw new Error(message)
      }

      setState({ loading: false, error: null, requests: payload?.requests ?? [] })
    } catch (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message, requests: [] }))
    }
  }, [sessionId, onSessionInvalid])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refresh: load }
}
