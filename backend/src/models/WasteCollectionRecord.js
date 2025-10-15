const { Schema, model } = require('mongoose');

const recordSchema = new Schema({
  collectionDate: { type: Date, required: true, index: true },
  region: { type: String, required: true, index: true },
  zone: { type: String },
  householdId: { type: String, required: true },
  customerType: {
    type: String,
    enum: ['household', 'business'],
    default: 'household',
  },
  wasteType: {
    type: String,
    enum: ['household', 'business', 'organic', 'recyclable', 'non-recyclable', 'industrial'],
    required: true,
  },
  billingModel: {
    type: String,
    enum: ['weight-based', 'flat-fee', 'subscription'],
    required: true,
  },
  weightKg: { type: Number, required: true, min: 0 },
  recyclableKg: { type: Number, default: 0, min: 0 },
  nonRecyclableKg: { type: Number, default: 0, min: 0 },
  recyclableRatio: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

recordSchema.index({ region: 1, collectionDate: -1 });
recordSchema.index({ billingModel: 1 });
recordSchema.index({ wasteType: 1 });

module.exports = model('WasteCollectionRecord', recordSchema);
