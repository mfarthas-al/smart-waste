const { Schema, model } = require('mongoose');
const schema = new Schema({
  binId: String,
  truckId: String,
  ts: { type: Date, default: Date.now },
  notes: String
}, { timestamps: true });
module.exports = model('CollectionEvent', schema);
