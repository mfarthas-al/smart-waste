const lk = require('../../config/region.lk.json')

const EARTH_RADIUS_KM = 6371

const toRadians = degrees => degrees * Math.PI / 180

const haversineKm = (from, to) => {
  if (!from || !to) return 0
  const dLat = toRadians((to.lat ?? 0) - (from.lat ?? 0))
  const dLon = toRadians((to.lon ?? 0) - (from.lon ?? 0))
  const lat1 = toRadians(from.lat ?? 0)
  const lat2 = toRadians(to.lat ?? 0)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.asin(Math.sqrt(a))
  return EARTH_RADIUS_KM * c
}

const estimateKg = bin => {
  if (!bin) return 0
  const capacity = Number(bin.capacityKg) || 0
  if (capacity <= 0) return 0

  const dailyRate = Number(bin.estRateKgPerDay) || 3
  const lastPickup = bin.lastPickupAt ? new Date(bin.lastPickupAt) : null
  const now = Date.now()
  const elapsedMs = lastPickup ? (now - lastPickup.getTime()) : 0
  const daysSinceLastPickup = Math.max(1, elapsedMs / 86_400_000)
  const estimated = dailyRate * daysSinceLastPickup
  return Math.min(capacity, estimated)
}

function optimize({
  bins = [],
  depot = lk.operations.default_depot,
  capacityKg = lk.operations.truck_capacity_kg,
  threshold = lk.operations.route_threshold,
} = {}) {
  const truckCapacity = Number(capacityKg) || 0
  const fillThreshold = Number(threshold) || 0
  const tieTolerance = 1e-6

  const candidates = bins
    .filter(bin => bin && bin.location && typeof bin.location.lat === 'number' && typeof bin.location.lon === 'number')
    .map(bin => ({ ...bin, estKg: estimateKg(bin) }))
    .filter(bin => {
      const capacity = Number(bin.capacityKg) || 0
      if (truckCapacity <= 0 || capacity <= 0) return false
      return (bin.estKg / capacity) >= fillThreshold
    })

  if (!candidates.length) {
    return { stops: [], loadKg: 0, distanceKm: 0 }
  }

  const remaining = [...candidates]
  const orderedStops = []
  let current = depot
  let totalLoad = 0

  while (remaining.length) {
    let chosenIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i]
      const distance = haversineKm(current, candidate.location)

      if (
        distance < bestDistance ||
        (Math.abs(distance - bestDistance) <= tieTolerance &&
          String(candidate.binId).localeCompare(String(remaining[chosenIndex].binId)) < 0)
      ) {
        bestDistance = distance
        chosenIndex = i
      }
    }

    const nextStop = remaining.splice(chosenIndex, 1)[0]
    if (truckCapacity && (totalLoad + nextStop.estKg) > truckCapacity) {
      break
    }

    orderedStops.push({
      binId: nextStop.binId,
      lat: nextStop.location.lat,
      lon: nextStop.location.lon,
      estKg: Math.round(nextStop.estKg),
      visited: Boolean(nextStop.visited),
    })
    totalLoad += nextStop.estKg
    current = nextStop.location
  }

  if (!orderedStops.length) {
    return { stops: [], loadKg: 0, distanceKm: 0 }
  }

  let travelled = 0
  current = depot
  for (const stop of orderedStops) {
    travelled += haversineKm(current, stop)
    current = stop
  }
  travelled += haversineKm(current, depot)

  return {
    stops: orderedStops,
    loadKg: Math.round(totalLoad),
    distanceKm: Number(travelled.toFixed(2)),
  }
}

module.exports = { estimateKg, optimize }
