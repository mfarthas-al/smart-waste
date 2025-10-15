const WasteBin = require('../../models/WasteBin')
const RoutePlan = require('../../models/RoutePlan')
const CollectionEvent = require('../../models/CollectionEvent')
const lk = require('../../config/region.lk.json')
const { optimize } = require('./service.routing')

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

exports.optimizeRoute = async (req, res) => {
  try {
    const { city, ward, date, truckId } = req.body || {}
    const serviceArea = city || ward
    if (!serviceArea) {
      return res.status(400).json({ error: 'city (or ward) is required' })
    }

    const assignedTruck = truckId || 'TRUCK-01'
    const planDate = date ? new Date(date) : new Date()
    const planDayStart = startOfDay(planDate)
    const planDayEnd = endOfDay(planDate)
    const depot = (lk.operations.city_depots && lk.operations.city_depots[serviceArea]) || lk.operations.default_depot
    const bins = await WasteBin.find({ ward: serviceArea }).lean().exec()
    const plan = optimize({ bins, depot })

    const payload = {
      ward: serviceArea,
      truckId: assignedTruck,
      date: planDayStart,
      depot,
      stops: (plan.stops || []).map(stop => ({ ...stop, visited: Boolean(stop.visited) })),
      loadKg: plan.loadKg || 0,
      distanceKm: plan.distanceKm || 0,
    }

    const saved = await RoutePlan.findOneAndUpdate(
      {
        ward: serviceArea,
        truckId: assignedTruck,
        date: { $gte: planDayStart, $lte: planDayEnd },
      },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    return res.json(saved ? saved.toObject() : payload)
  } catch (error) {
    console.error('optimizeRoute error', error)
    return res.status(500).json({ error: 'Unable to optimize route' })
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
      RoutePlan.updateOne(filter, { $set: { 'stops.$.visited': true } }).exec(),
      WasteBin.updateOne({ binId }, { $set: { lastPickupAt: now } }).exec(),
    ])

    return res.status(201).json({ ok: true })
  } catch (error) {
    console.error('recordCollection error', error)
    return res.status(500).json({ error: 'Unable to record collection' })
  }
}
