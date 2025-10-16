const { Schema, model, Types } = require('mongoose');

const paymentSchema = new Schema({
  requestId: { type: Types.ObjectId, ref: 'SpecialCollectionRequest' },
  userId: { type: Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    required: true,
  },
  provider: { type: String, default: 'internal' },
  reference: { type: String },
  stripeSessionId: { type: String, index: true },
  slotId: { type: String, index: true },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

paymentSchema.index({ requestId: 1 });
paymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = model('SpecialCollectionPayment', paymentSchema);
