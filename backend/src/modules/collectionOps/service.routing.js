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

const buildPlans = ({ candidates, depot, truckCapacity, trucks, maxDistanceKm }) => {
  const plans = []
  const remaining = [...candidates]
  const tieTolerance = 1e-6

  while (remaining.length && plans.length < trucks) {
    let currentLocation = depot
    let currentLoad = 0
    let travelled = 0
    const stops = []

    while (remaining.length) {
      let chosenIndex = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (let i = 0; i < remaining.length; i += 1) {
        const candidate = remaining[i]
        const distance = haversineKm(currentLocation, candidate.location)

        if (
          distance < bestDistance ||
          (Math.abs(distance - bestDistance) <= tieTolerance &&
            String(candidate.binId).localeCompare(String(remaining[chosenIndex].binId)) < 0)
        ) {
          bestDistance = distance
          chosenIndex = i
        }
      }

      const nextStop = remaining[chosenIndex]
      if (truckCapacity && (currentLoad + nextStop.estKg) > truckCapacity) {
        break
      }

      const projectedTravel = travelled + haversineKm(currentLocation, nextStop.location)
      const loopBackDistance = haversineKm(nextStop.location, depot)
      const projectedTotal = projectedTravel + loopBackDistance

      if (maxDistanceKm && projectedTotal > maxDistanceKm) {
        break
      }

      remaining.splice(chosenIndex, 1)
      stops.push({
        binId: nextStop.binId,
        lat: nextStop.location.lat,
        lon: nextStop.location.lon,
        estKg: Math.round(nextStop.estKg),
        visited: Boolean(nextStop.visited),
      })
      currentLoad += nextStop.estKg
      travelled = projectedTravel
      currentLocation = nextStop.location
    }

    if (stops.length) {
      travelled += haversineKm(currentLocation, depot)
      plans.push({
        stops,
        loadKg: Math.round(currentLoad),
        distanceKm: Number(travelled.toFixed(2)),
      })
    } else {
      break
    }
  }

  if (!plans.length) {
    plans.push({ stops: [], loadKg: 0, distanceKm: 0 })
  }

  return plans
}

const toCandidates = ({ bins, depot, threshold, truckCapacity }) => {
  return bins
    .filter(bin => bin && bin.location && typeof bin.location.lat === 'number' && typeof bin.location.lon === 'number')
    .map(bin => ({ ...bin, estKg: estimateKg(bin) }))
    .filter(bin => {
      const capacity = Number(bin.capacityKg) || 0
      if (truckCapacity <= 0 || capacity <= 0) return false
      return (bin.estKg / capacity) >= threshold
    })
    .sort((a, b) => {
      const da = haversineKm(depot, a.location)
      const db = haversineKm(depot, b.location)
      if (da === db) return String(a.binId).localeCompare(String(b.binId))
      return da - db
    })
}

function optimize(options = {}) {
  if (options && options.params) {
    const { bins = [], params = {} } = options
    const depot = params.depot || lk.operations.default_depot
    const truckCapacity = Number(params.truckCapacityKg || lk.operations.truck_capacity_kg || 0)
    const threshold = Number(params.threshold ?? lk.operations.route_threshold ?? 0.2)
    const trucks = Math.max(1, Number(params.trucks || 1))
    const maxTimeHrs = Number(params.maxTimeHrs || 0)
    const avgSpeedKph = Number(params.avgSpeedKph || 25)
    const maxDistanceKm = maxTimeHrs > 0 ? maxTimeHrs * avgSpeedKph : 0

    const candidates = toCandidates({ bins, depot, threshold, truckCapacity })
    if (!candidates.length) {
      return [{ stops: [], loadKg: 0, distanceKm: 0 }]
    }

    return buildPlans({ candidates, depot, truckCapacity, trucks, maxDistanceKm })
  }

  const {
    bins = [],
    depot = lk.operations.default_depot,
    capacityKg = lk.operations.truck_capacity_kg,
    threshold = lk.operations.route_threshold,
  } = options

  const truckCapacity = Number(capacityKg) || 0
  const candidates = toCandidates({ bins, depot, threshold: Number(threshold) || 0, truckCapacity })
  const plans = buildPlans({ candidates, depot, truckCapacity, trucks: 1 })
  return plans[0]
}

module.exports = { estimateKg, optimize }
