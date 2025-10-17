const { Schema, model } = require('mongoose');

const CUSTOMER_TYPES = Object.freeze(['household', 'business']);
const WASTE_TYPES = Object.freeze(['household', 'business', 'organic', 'recyclable', 'non-recyclable', 'industrial']);
const BILLING_MODELS = Object.freeze(['weight-based', 'flat-fee', 'subscription']);

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

const recordSchema = new Schema({
  collectionDate: { type: Date, required: true, index: true },
  region: { type: String, required: true, index: true },
  zone: { type: String },
  householdId: { type: String, required: true },
  customerType: {
    type: String,
    enum: CUSTOMER_TYPES,
    default: CUSTOMER_TYPES[0],
  },
  wasteType: {
    type: String,
    enum: WASTE_TYPES,
    required: true,
  },
  billingModel: {
    type: String,
    enum: BILLING_MODELS,
    required: true,
  },
  weightKg: { type: Number, required: true, min: 0 },
  recyclableKg: { type: Number, default: 0, min: 0 },
  nonRecyclableKg: { type: Number, default: 0, min: 0 },
  recyclableRatio: { type: Number, default: 0, min: 0 },
}, schemaOptions);

// Enables dashboards to slice records by geography, billing model, and waste type efficiently.
recordSchema.index({ region: 1, collectionDate: -1 });
recordSchema.index({ billingModel: 1 });
recordSchema.index({ wasteType: 1 });

module.exports = model('WasteCollectionRecord', recordSchema);
