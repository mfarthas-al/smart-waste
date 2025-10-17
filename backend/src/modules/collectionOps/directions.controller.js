const RoutePlan = require('../../models/RoutePlan')

const fetch = (...args) => import('node-fetch').then(({ default: fn }) => fn(...args))

const toOSRMCoords = coords => coords.map(([lat, lon]) => `${lon},${lat}`).join(';')

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
      ...plan.stops.map(stop => [stop.lat, stop.lon]),
      [depot.lat, depot.lon],
    ]

    const url = `https://router.project-osrm.org/route/v1/driving/${toOSRMCoords(coordinates)}?overview=full&geometries=geojson&steps=false&roundtrip=false`
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(502).json({ error: 'OSRM service unavailable' })
    }
    const data = await response.json()
    const route = data.routes && data.routes[0]
    if (!route) {
      return res.json({ line: null, distanceKm: 0, durationMin: 0 })
    }

    return res.json({
      line: route.geometry,
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMin: Math.round(route.duration / 60),
    })
  } catch (error) {
    console.error('getPlanDirections error', error)
    return res.status(500).json({ error: 'Unable to fetch directions' })
  }
}
