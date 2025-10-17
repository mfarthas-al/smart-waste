const { Schema, model } = require('mongoose');

/**
 * Constants for waste collection record enumerations
 * Following Single Responsibility Principle (SRP) by separating configuration
 */
const CUSTOMER_TYPES = {
  HOUSEHOLD: 'household',
  BUSINESS: 'business',
};

const WASTE_TYPES = {
  HOUSEHOLD: 'household',
  BUSINESS: 'business',
  ORGANIC: 'organic',
  RECYCLABLE: 'recyclable',
  NON_RECYCLABLE: 'non-recyclable',
  INDUSTRIAL: 'industrial',
};

const BILLING_MODELS = {
  WEIGHT_BASED: 'weight-based',
  FLAT_FEE: 'flat-fee',
  SUBSCRIPTION: 'subscription',
};

/**
 * Waste Collection Record Schema
 * 
 * Represents a single waste collection event for tracking and analytics purposes.
 * This model follows the Information Expert pattern by encapsulating waste collection
 * data and related business logic.
 * 
 * @schema WasteCollectionRecord
 * @property {Date} collectionDate - The date when waste was collected
 * @property {String} region - Geographic region of the collection
 * @property {String} zone - Specific zone within the region (optional)
 * @property {String} householdId - Unique identifier for the household/business
 * @property {String} customerType - Type of customer (household/business)
 * @property {String} wasteType - Category of waste collected
 * @property {String} billingModel - Billing method applied to this collection
 * @property {Number} weightKg - Total weight of waste in kilograms
 * @property {Number} recyclableKg - Weight of recyclable waste in kilograms
 * @property {Number} nonRecyclableKg - Weight of non-recyclable waste in kilograms
 * @property {Number} recyclableRatio - Ratio of recyclable to total waste (0-1)
 */
const recordSchema = new Schema({
  collectionDate: { 
    type: Date, 
    required: [true, 'Collection date is required'], 
    index: true,
    validate: {
      validator: (value) => value <= new Date(),
      message: 'Collection date cannot be in the future',
    },
  },
  region: { 
    type: String, 
    required: [true, 'Region is required'], 
    index: true,
    trim: true,
    minlength: [1, 'Region cannot be empty'],
  },
  zone: { 
    type: String,
    trim: true,
  },
  householdId: { 
    type: String, 
    required: [true, 'Household ID is required'],
    trim: true,
    index: true,
  },
  customerType: {
    type: String,
    enum: {
      values: Object.values(CUSTOMER_TYPES),
      message: '{VALUE} is not a valid customer type',
    },
    default: CUSTOMER_TYPES.HOUSEHOLD,
  },
  wasteType: {
    type: String,
    enum: {
      values: Object.values(WASTE_TYPES),
      message: '{VALUE} is not a valid waste type',
    },
    required: [true, 'Waste type is required'],
  },
  billingModel: {
    type: String,
    enum: {
      values: Object.values(BILLING_MODELS),
      message: '{VALUE} is not a valid billing model',
    },
    required: [true, 'Billing model is required'],
  },
  weightKg: { 
    type: Number, 
    required: [true, 'Weight is required'], 
    min: [0, 'Weight cannot be negative'],
    validate: {
      validator: Number.isFinite,
      message: 'Weight must be a valid number',
    },
  },
  recyclableKg: { 
    type: Number, 
    default: 0, 
    min: [0, 'Recyclable weight cannot be negative'],
  },
  nonRecyclableKg: { 
    type: Number, 
    default: 0, 
    min: [0, 'Non-recyclable weight cannot be negative'],
  },
  recyclableRatio: { 
    type: Number, 
    default: 0, 
    min: [0, 'Recyclable ratio cannot be negative'],
    max: [1, 'Recyclable ratio cannot exceed 1'],
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

/**
 * Compound indexes for optimized query performance
 * These indexes support common analytics queries combining region and date
 */
recordSchema.index({ region: 1, collectionDate: -1 });
recordSchema.index({ billingModel: 1, collectionDate: -1 });
recordSchema.index({ wasteType: 1, collectionDate: -1 });
recordSchema.index({ householdId: 1, collectionDate: -1 });

/**
 * Pre-save hook to calculate recyclable ratio automatically
 * Follows DRY principle by centralizing this calculation logic
 */
recordSchema.pre('save', function calculateRecyclableRatio(next) {
  if (this.weightKg > 0) {
    this.recyclableRatio = Number((this.recyclableKg / this.weightKg).toFixed(4));
  } else {
    this.recyclableRatio = 0;
  }
  next();
});

/**
 * Virtual property to check if the collection is primarily recyclable
 * @returns {Boolean} True if more than 50% of waste is recyclable
 */
recordSchema.virtual('isPrimarilyRecyclable').get(function() {
  return this.recyclableRatio > 0.5;
});

/**
 * Static method to get date range boundaries
 * Encapsulates query logic following Information Expert pattern
 * 
 * @returns {Promise<Object>} Object containing earliest and latest collection dates
 */
recordSchema.statics.getDateRange = async function() {
  const [earliest, latest] = await Promise.all([
    this.findOne().sort({ collectionDate: 1 }).select('collectionDate').lean(),
    this.findOne().sort({ collectionDate: -1 }).select('collectionDate').lean(),
  ]);
  
  return {
    from: earliest?.collectionDate ?? null,
    to: latest?.collectionDate ?? null,
  };
};

/**
 * Static method to get all distinct filter values
 * Provides a clean interface for retrieving configuration data
 * 
 * @returns {Promise<Object>} Object containing arrays of unique regions, waste types, and billing models
 */
recordSchema.statics.getDistinctFilters = async function() {
  const [regions, wasteTypes, billingModels] = await Promise.all([
    this.distinct('region'),
    this.distinct('wasteType'),
    this.distinct('billingModel'),
  ]);
  
  return { regions, wasteTypes, billingModels };
};

// Export the model and constants for use in other modules
module.exports = model('WasteCollectionRecord', recordSchema);
module.exports.CUSTOMER_TYPES = CUSTOMER_TYPES;
module.exports.WASTE_TYPES = WASTE_TYPES;
module.exports.BILLING_MODELS = BILLING_MODELS;
