const { Schema, model } = require('mongoose');
const stop = new Schema({
  binId: String, lat: Number, lon: Number, estKg: Number, visited: { type: Boolean, default: false }
}, { _id: false });
const schema = new Schema({
  date: Date,
  ward: String,
  truckId: String,
  stops: [stop],
  loadKg: Number,
  distanceKm: Number
}, { timestamps: true });
module.exports = model('RoutePlan', schema);
