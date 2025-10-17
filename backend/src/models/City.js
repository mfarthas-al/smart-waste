const { Schema, model } = require('mongoose');

const schemaOptions = {
  timestamps: true,
  toJSON: { versionKey: false },
  toObject: { versionKey: false },
};

const bboxSchema = {
  type: [[Number]],
  default: undefined,
};

const schema = new Schema({
  name: { type: String, unique: true, index: true },
  code: { type: String, unique: true },
  depot: { lat: Number, lon: Number },
  bbox: bboxSchema,
  areaSqKm: Number,
  population: Number,
  lastCollectionAt: Date,
}, schemaOptions);

module.exports = model('City', schema);
