const WasteBin = require('../../models/WasteBin');
const RoutePlan = require('../../models/RoutePlan');
const CollectionEvent = require('../../models/CollectionEvent');
const { optimize } = require('./service.routing');

exports.optimizeRoute = async (req, res) => {
  const { ward = 'CMC-W05', date, truckId = 'TRUCK-01' } = req.body || {};
  const bins = await WasteBin.find({ ward }).lean();
  const plan = optimize({ bins });
  const saved = await RoutePlan.create({ date: date || new Date(), ward, truckId, ...plan });
  res.json(saved);
};

exports.getTodayRoute = async (req, res) => {
  const { truckId } = req.params;
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  const plan = await RoutePlan.findOne({ truckId, date: { $gte: start, $lte: end } });
  res.json(plan || { stops: [] });
};

exports.recordCollection = async (req, res) => {
  const { binId, truckId = 'TRUCK-01', notes } = req.body;
  await CollectionEvent.create({ binId, truckId, notes });
  await RoutePlan.updateOne({ truckId, 'stops.binId': binId }, { $set: { 'stops.$.visited': true } });
  await WasteBin.updateOne({ binId }, { $set: { lastPickupAt: new Date() } });
  res.status(201).json({ ok: true });
};
