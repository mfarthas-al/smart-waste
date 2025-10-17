const { Schema, model } = require('mongoose');
const schema = new Schema({
  binId: { type: String, unique: true, index: true },
  ward: String,
  city: { type: String, index: true },
  area: { type: String, index: true },
  location: { lat: Number, lon: Number },
  capacityKg: Number,
  lastPickupAt: Date,
  estRateKgPerDay: { type: Number, default: 3 }
}, { timestamps: true });

schema.index({ city: 1, area: 1 })

module.exports = model('WasteBin', schema);
