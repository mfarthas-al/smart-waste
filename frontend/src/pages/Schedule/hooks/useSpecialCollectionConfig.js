import { useEffect, useState } from 'react'
import { safeJson } from '../utils.js'

export function useSpecialCollectionConfig() {
  const [state, setState] = useState({ loading: true, error: null, items: [], slotConfig: null })

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const response = await fetch('/api/schedules/special/config')
        const payload = await safeJson(response)
        if (cancelled) {
          return
        }

        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || 'Unable to load scheduling configuration')
        }

        setState({
          loading: false,
          error: null,
          items: payload?.items ?? [],
          slotConfig: payload?.slotConfig ?? null,
        })
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, items: [], slotConfig: null })
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
