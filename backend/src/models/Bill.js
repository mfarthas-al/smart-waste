const { Schema, model, Types } = require('mongoose');

const billSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceNumber: { type: String, required: true, unique: true },
  description: { type: String },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'LKR' },
  billingPeriodStart: { type: Date },
  billingPeriodEnd: { type: Date },
  generatedAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  status: {
    type: String,
    enum: ['unpaid', 'paid', 'cancelled'],
    default: 'unpaid',
    index: true,
  },
  paidAt: { type: Date },
  paymentMethod: { type: String },
  stripeSessionId: { type: String, index: true },
  stripePaymentIntentId: { type: String },
}, { timestamps: true });

billSchema.index({ dueDate: 1 });

module.exports = model('Bill', billSchema);
