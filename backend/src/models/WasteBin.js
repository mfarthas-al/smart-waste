const { Schema, model } = require('mongoose');
const schema = new Schema({
  binId: { type: String, unique: true, index: true },
  ward: String,
  location: { lat: Number, lon: Number },
  capacityKg: Number,
  lastPickupAt: Date,
  estRateKgPerDay: { type: Number, default: 3 }
}, { timestamps: true });
module.exports = model('WasteBin', schema);
