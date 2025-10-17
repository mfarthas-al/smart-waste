const RoutePlan = require('../../models/RoutePlan')

const resolveFetch = () => {
  if (typeof globalThis.__osrmFetch === 'function') {
    return globalThis.__osrmFetch
  }
  return (...args) => import('node-fetch').then(({ default: fn }) => fn(...args))
}

const fetch = (...args) => resolveFetch()(...args)

const AVG_SPEED_KPH = 25
const EARTH_RADIUS_KM = 6371

const toOSRMCoords = coords => coords.map(([lat, lon]) => `${lon},${lat}`).join(';')
const toGeoJSON = coords => ({
  type: 'LineString',
  coordinates: coords.map(([lat, lon]) => [lon, lat]),
})

const isValidCoord = pair => Array.isArray(pair)
  && pair.length === 2
  && pair.every(value => typeof value === 'number' && Number.isFinite(value))

const toRadians = degrees => degrees * Math.PI / 180

const haversineKm = (from, to) => {
  if (!isValidCoord(from) || !isValidCoord(to)) return 0
  const [lat1, lon1] = from
  const [lat2, lon2] = to
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.asin(Math.sqrt(a))
  return EARTH_RADIUS_KM * c
}

const summarizeDistance = coords => {
  let total = 0
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineKm(coords[i - 1], coords[i])
  }
  return total
}

exports.getPlanDirections = async (req, res) => {
  try {
    const { truckId } = req.params
    if (!truckId) {
      return res.status(400).json({ error: 'truckId is required' })
    }

    const plan = await RoutePlan.findOne({ truckId }).sort({ updatedAt: -1 }).lean()
    if (!plan?.stops?.length) {
      return res.json({ line: null, distanceKm: 0, durationMin: 0 })
    }

    const depot = plan.depot || { lat: 6.927, lon: 79.861 }
    const coordinates = [
      [depot.lat, depot.lon],
      ...plan.stops
        .map(stop => [stop.lat, stop.lon])
        .filter(isValidCoord),
      [depot.lat, depot.lon],
    ]

    if (coordinates.length < 2) {
      return res.json({ line: null, distanceKm: 0, durationMin: 0 })
    }

    const fallback = () => {
      const storedDistance = Number(plan.distanceKm)
      const hasStored = Number.isFinite(storedDistance) && storedDistance > 0
      const distanceKm = hasStored
        ? storedDistance
        : Number(summarizeDistance(coordinates).toFixed(2))
      const durationMin = Math.round((distanceKm / AVG_SPEED_KPH) * 60)
      return {
        line: toGeoJSON(coordinates),
        distanceKm: Number(distanceKm.toFixed(2)),
        durationMin: durationMin > 0 ? durationMin : 0,
        fallback: true,
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${toOSRMCoords(coordinates)}?overview=full&geometries=geojson&steps=false&roundtrip=false`
      const response = await fetch(url, { signal: controller.signal })

      if (!response.ok) {
        console.warn('OSRM responded with', response.status)
        return res.json(fallback())
      }

      const data = await response.json()
      const route = data.routes && data.routes[0]
      if (!route) {
        return res.json(fallback())
      }

      return res.json({
        line: route.geometry,
        distanceKm: Number((route.distance / 1000).toFixed(2)),
        durationMin: Math.round(route.duration / 60),
      })
    } catch (err) {
      console.error('OSRM fetch failed, serving fallback', err.message)
      return res.json(fallback())
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.error('getPlanDirections error', error)
    return res.status(500).json({ error: 'Unable to fetch directions' })
  }
}
