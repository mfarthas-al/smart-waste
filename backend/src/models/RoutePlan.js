const { Schema, model } = require('mongoose');
const stop = new Schema({
  binId: String, lat: Number, lon: Number, estKg: Number, visited: { type: Boolean, default: false }
}, { _id: false });
const schema = new Schema({
  date: { type: Date, index: true },
  timeWindow: { type: String, index: true, default: null },
  ward: String,
  city: { type: String, index: true },
  area: { type: String, index: true },
  truckId: { type: String, index: true },
  depot: { lat: Number, lon: Number },
  stops: [stop],
  loadKg: Number,
  distanceKm: Number,
  status: { type: String, enum: ['draft', 'confirmed'], default: 'confirmed' },
  summary: {
    totalBins: Number,
    consideredBins: Number,
    highPriorityBins: Number,
    truckCapacityKg: Number,
    trucks: Number,
    threshold: Number,
  }
}, { timestamps: true });

schema.index({ city: 1, truckId: 1, date: 1 })
schema.index({ city: 1, timeWindow: 1, date: 1 })

module.exports = model('RoutePlan', schema);
