const City = require('../../models/City')
const WasteBin = require('../../models/WasteBin')
const RoutePlan = require('../../models/RoutePlan')
const CollectionEvent = require('../../models/CollectionEvent')
const lk = require('../../config/region.lk.json')
const { estimateKg, optimize } = require('./service.routing')
const HIGH_PRIORITY_RATIO = 0.25

const startOfDay = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const endOfDay = date => {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Derive the bin fill threshold used for route optimisation, applying operator adjustments.
 * @param {{ skipBelow30?: boolean, emergencyOnly?: boolean, prioritizeCommercial?: boolean }} [adjustments]
 * @returns {number} A ratio between 0 and 0.9 representing the minimum fill level.
 */
const computeThreshold = adjustments => {
  const base = Number(lk.operations.route_threshold ?? 0.2)
  let threshold = base
  if (adjustments?.skipBelow30) {
    threshold = Math.max(threshold, 0.3)
  }
  if (adjustments?.emergencyOnly) {
    threshold = Math.max(threshold, 0.6)
  }
  if (adjustments?.prioritizeCommercial) {
    threshold = Math.max(0.1, threshold - 0.05)
  }
  return Math.min(0.9, threshold)
}

const DEFAULT_FLEET = ['TRUCK-01', 'TRUCK-02', 'TRUCK-03', 'TRUCK-04']

exports.listCities = async (_req, res) => {
  const cities = await City.find().select('name code depot bbox areaSqKm population lastCollectionAt -_id').lean()
  res.json(cities)
}

exports.listBinsByCity = async (req, res) => {
  const query = {}
  if (req.query.city) {
    query.city = req.query.city
  }
  const bins = await WasteBin.find(query)
    .select('binId city area location capacityKg lastPickupAt estRateKgPerDay -_id')
    .lean()
  res.json(bins)
}

exports.optimizeRoute = async (req, res) => {
  try {
    const { city, ward, area, date, truckId, constraints = {}, adjustments = {} } = req.body || {}
    const serviceArea = city || ward
    if (!serviceArea) {
      return res.status(400).json({ error: 'city (or ward) is required' })
    }

    const cityDoc = await City.findOne({ name: serviceArea }).lean()
    const depot = cityDoc?.depot || (lk.operations.city_depots && lk.operations.city_depots[serviceArea]) || lk.operations.default_depot

    const bins = await WasteBin.find(area ? { city: serviceArea, area } : { city: serviceArea }).lean().exec()
    const threshold = computeThreshold(adjustments)
    const truckCapacityKg = Number(constraints.truckCapacityKg || lk.operations.truck_capacity_kg || 3000)
    const trucks = Math.max(1, Number(constraints.trucks || 1))
    const maxTimeHrs = Number(constraints.maxTimeHrs || constraints.maxTime || 0)
    const avgSpeedKph = adjustments?.avoidPeak ? 18 : 25

    const totalBins = bins.length
    const enriched = bins.map(bin => {
      const capacity = Number(bin.capacityKg) || 240
      const estKg = estimateKg(bin)
      const ratio = capacity > 0 ? estKg / capacity : 0
      return { ...bin, estKg, ratio }
    })
    const consideredBins = enriched.filter(b => b.ratio >= threshold)
    const highPriorityBins = enriched.filter(b => b.ratio >= HIGH_PRIORITY_RATIO)

    const plans = optimize({
      bins,
      params: {
        depot,
        threshold,
        truckCapacityKg,
        trucks,
        maxTimeHrs,
        avgSpeedKph,
      },
    })

    const planDate = date ? new Date(date) : new Date()
    const planDayStart = startOfDay(planDate)
    const planDayEnd = endOfDay(planDate)

    const summaryBlock = {
      totalBins,
      consideredBins: consideredBins.length,
      highPriorityBins: highPriorityBins.length,
      truckCapacityKg,
      trucks,
      threshold,
    }

    const savedPlans = []
    plans.forEach((plan, index) => {
      const assignedTruck = index === 0 && truckId ? truckId : `TRUCK-${String(index + 1).padStart(2, '0')}`
      savedPlans.push({ assignedTruck, plan })
    })

    const persisted = []
    for (const entry of savedPlans) {
      const payload = {
        ward: serviceArea,
        city: serviceArea,
        area: area || null,
        truckId: entry.assignedTruck,
        date: planDayStart,
        depot,
        stops: (entry.plan.stops || []).map(stop => ({ ...stop, visited: Boolean(stop.visited) })),
        loadKg: entry.plan.loadKg || 0,
        distanceKm: entry.plan.distanceKm || 0,
        summary: summaryBlock,
      }

      const doc = await RoutePlan.findOneAndUpdate(
        {
          city: serviceArea,
          area: area || null,
          truckId: entry.assignedTruck,
          date: { $gte: planDayStart, $lte: planDayEnd },
        },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )

      persisted.push(doc ? doc.toObject() : payload)
    }

    const primaryPlan = persisted[0] || {
      city: serviceArea,
      area: area || null,
      truckId: truckId || 'TRUCK-01',
      stops: [],
      loadKg: 0,
      distanceKm: 0,
      depot,
    }

    const response = {
      ...primaryPlan,
      summary: primaryPlan.summary || summaryBlock,
    }

    return res.json(response)
  } catch (error) {
    console.error('optimizeRoute error', error)
    return res.status(500).json({ error: 'Unable to optimize route' })
  }
}

exports.getPlanByCity = async (req, res) => {
  try {
    const { city } = req.query
    if (!city) {
      return res.status(400).json({ error: 'city is required' })
    }

    const plan = await RoutePlan.findOne({ city })
      .sort({ updatedAt: -1 })
      .lean()

    if (!plan) {
      return res.status(404).json({ error: 'No plan available' })
    }

    const depot = plan.depot || (lk.operations.city_depots && lk.operations.city_depots[plan.ward]) || lk.operations.default_depot

    const summarySource = plan.summary || {}
    const binsInCity = await WasteBin.find({ city })
      .select('binId capacityKg lastPickupAt estRateKgPerDay')
      .lean()

    const derivedTotalBins = typeof summarySource.totalBins === 'number'
      ? summarySource.totalBins
      : binsInCity.length

    const appliedThreshold = summarySource.threshold ?? Number(lk.operations.route_threshold ?? 0.2)
    const enriched = binsInCity
      .map(bin => {
        const capacity = Number(bin.capacityKg) || 0
        if (capacity <= 0) {
          return null
        }
        const estimated = estimateKg(bin)
        return {
          ratio: estimated / capacity,
        }
      })
      .filter(Boolean)

    const consideredBins = enriched.filter(entry => entry.ratio >= appliedThreshold).length
      const highPriorityBins = enriched.filter(entry => entry.ratio >= HIGH_PRIORITY_RATIO).length

    const summary = {
      totalBins: derivedTotalBins,
      consideredBins: consideredBins ?? (plan.stops?.length || 0),
      highPriorityBins: highPriorityBins ?? 0,
      truckCapacityKg: summarySource.truckCapacityKg ?? Number(lk.operations.truck_capacity_kg || 3000),
      trucks: summarySource.trucks ?? 1,
      threshold: appliedThreshold,
    }

    return res.json({
      ...plan,
      depot,
      summary,
    })
  } catch (error) {
    console.error('getPlanByCity error', error)
    return res.status(500).json({ error: 'Unable to load plan for city' })
  }
}

exports.getOpsSummary = async (_req, res) => {
  try {
    const now = new Date()
    const [cities, totalBins, todaysPlans] = await Promise.all([
      City.find().select('name lastCollectionAt').lean(),
      WasteBin.countDocuments().exec(),
      RoutePlan.find({
        date: { $gte: startOfDay(now), $lte: endOfDay(now) },
      })
        .select('truckId -_id')
        .lean(),
    ])

    const activeWindowMs = 7 * 24 * 60 * 60 * 1000
    const activeZones = cities.filter(city => {
      if (!city.lastCollectionAt) return false
      const ts = new Date(city.lastCollectionAt).getTime()
      if (Number.isNaN(ts)) return false
      return now.getTime() - ts <= activeWindowMs
    }).length

    const fleet = Array.isArray(lk.operations?.fleet_trucks) && lk.operations.fleet_trucks.length
      ? lk.operations.fleet_trucks
      : DEFAULT_FLEET

    const engaged = new Set(
      (todaysPlans || [])
        .map(plan => plan.truckId)
        .filter(Boolean)
    )

    const availableTrucks = Math.max(fleet.length - engaged.size, 0)

    res.json({
      activeZones: activeZones || cities.length,
      totalZones: cities.length,
      availableTrucks,
      engagedTrucks: engaged.size,
      fleetSize: fleet.length,
      totalBins,
    })
  } catch (error) {
    console.error('getOpsSummary error', error)
    res.status(500).json({ error: 'Unable to load operations summary' })
  }
}

exports.getTodayRoute = async (req, res) => {
  try {
    const { truckId } = req.params
    if (!truckId) {
      return res.status(400).json({ error: 'truckId is required' })
    }

    const today = new Date()
    const plan = await RoutePlan.findOne({
      truckId,
      date: { $gte: startOfDay(today), $lte: endOfDay(today) },
    })
      .sort({ updatedAt: -1 })
      .lean()

    if (!plan) {
      return res.json({ stops: [] })
    }

    if (!plan.depot) {
      const fallbackDepot = (lk.operations.city_depots && lk.operations.city_depots[plan.ward]) || lk.operations.default_depot
      plan.depot = fallbackDepot
    }

    return res.json(plan)
  } catch (error) {
    console.error('getTodayRoute error', error)
    return res.status(500).json({ error: 'Unable to load route' })
  }
}

exports.recordCollection = async (req, res) => {
  try {
    const { binId, truckId, notes } = req.body || {}
    if (!binId) {
      return res.status(400).json({ error: 'binId is required' })
    }

    const assignedTruck = truckId || 'TRUCK-01'
    const now = new Date()

    await CollectionEvent.create({ binId, truckId: assignedTruck, notes, ts: now })

    const filter = {
      truckId: assignedTruck,
      date: { $gte: startOfDay(now), $lte: endOfDay(now) },
      'stops.binId': binId,
    }

    await Promise.all([
      RoutePlan.updateOne(filter, { $set: { 'stops.$.visited': true } }, { timestamps: true }).exec(),
      WasteBin.updateOne({ binId }, { $set: { lastPickupAt: now } }).exec(),
    ])

    return res.status(201).json({ ok: true })
  } catch (error) {
    console.error('recordCollection error', error)
    return res.status(500).json({ error: 'Unable to record collection' })
  }
}
